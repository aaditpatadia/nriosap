import "server-only";
import { asService, tx } from "./db";
import { log } from "./log";
import { canExecute, paymentPartner } from "./payments";
import { hourBudget, overHourBudget } from "./rules";
import { LANGUAGE_CODE } from "./transcribe";
import type { Language } from "./types";
import { sendTemplate } from "./wa-client";

type Row = Record<string, any>;

const service = <T>(fn: Parameters<typeof tx<T>>[0]) => asService(() => tx(fn));

async function alert(t: { run(s: string, p?: unknown[]): Promise<number> }, familyId: string | null, kind: string, key: string, body: string) {
  return t.run("insert into alerts(family_id, kind, dedupe_key, body) values ($1,$2,$3,$4) on conflict (dedupe_key) do nothing", [familyId, kind, key, body]);
}

/** Tasks past SLA and families over their hour budget. PRD section 9: founder alert. */
export async function runSlaAlerts(): Promise<{ raised: number }> {
  return service(async (t) => {
    let raised = 0;
    await t.run("update alerts a set resolved_at = now() from tasks k where a.kind = 'sla' and a.resolved_at is null and a.dedupe_key = 'sla:' || k.id and k.status = 'done'");
    const late = await t.rows<Row>("select k.id, k.title, k.family_id, f.name from tasks k join families f on f.id = k.family_id where k.status <> 'done' and k.sla_at < now()");
    for (const k of late) raised += await alert(t, k.family_id, "sla", `sla:${k.id}`, `Past SLA: ${k.title} (${k.name})`);
    const hours = await t.rows<Row>(
      `select f.id, f.name, f.plan_usd, coalesce(sum(e.minutes),0)::float / 60 as h
       from families f left join time_entries e on e.family_id = f.id and e.at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
       group by f.id`,
    );
    const month = new Date().toISOString().slice(0, 7);
    for (const f of hours) if (overHourBudget(Number(f.plan_usd), Number(f.h))) raised += await alert(t, f.id, "hours", `hours:${f.id}:${month}`, `${f.name} is over its ${hourBudget(Number(f.plan_usd))} hour budget this month.`);
    log("info", "job_sla_alerts", { raised });
    return { raised };
  });
}

/** Open task waiting on a parent with no reply for 24 hours: the coordinator phones. */
export async function runNoReplyCheck(): Promise<{ raised: number }> {
  return service(async (t) => {
    let raised = 0;
    const rows = await t.rows<Row>(
      `select k.id, k.title, k.family_id from tasks k
       where k.status = 'waiting_parent'
         and not exists (select 1 from messages m where m.family_id = k.family_id and m.direction = 'in' and m.created_at > now() - interval '24 hours')`,
    );
    const day = new Date().toISOString().slice(0, 10);
    for (const k of rows) raised += await alert(t, k.family_id, "no_reply", `noreply:${k.id}:${day}`, `No reply in 24 hours. Please phone: ${k.title}`);
    return { raised };
  });
}

/** Sends template reminders, the one thing AI may send alone. Goes nowhere while the WhatsApp flag is off. */
async function remind(parent: Row, name: string, params: string[]) {
  const r = await sendTemplate(parent.phone, name, LANGUAGE_CODE[parent.language as Language].split("-")[0], params);
  return r.status;
}

/** Policy renewals 30, 7 and 1 days out. */
export async function runRenewalReminders(): Promise<{ raised: number }> {
  const due = await service((t) =>
    t.rows<Row>(
      `select pol.id, pol.family_id, pol.insurer, pol.renewal_date, (pol.renewal_date - current_date) as days, p.name, p.phone, p.language, f.coordinator_id
       from policies pol join families f on f.id = pol.family_id join parents p on p.family_id = f.id
       where (pol.renewal_date - current_date) in (30, 7, 1) and p.consent_status = 'granted'`,
    ),
  );
  let raised = 0;
  for (const d of due) {
    const n = await service(async (t) => {
      const fresh = await alert(t, d.family_id, "renewal", `renewal:${d.id}:${d.days}`, `Policy with ${d.insurer} renews in ${d.days} day(s).`);
      if (fresh && Number(d.days) === 30) {
        await t.run(`insert into tasks(family_id, kind, title, status, owner_id, due_at, sla_at, hour_budget, needs_approval) values ($1,'renewal',$2,'todo',$3, now() + interval '14 days', now() + interval '14 days', 1, true)`, [d.family_id, `Prepare policy renewal: ${d.insurer}`, d.coordinator_id]);
      }
      return fresh;
    });
    if (n) await remind(d, "task_update", [d.name, `your health policy renews in ${d.days} day(s)`]);
    raised += n;
  }
  return { raised };
}

/** Bills found by extraction, 3 days before they fall due. */
export async function runBillReminders(): Promise<{ raised: number }> {
  const { decryptField } = await import("./crypto");
  const docs = await service((t) => t.rows<Row>("select d.id, d.family_id, d.extracted_enc from documents d where d.kind = 'bill' and d.extracted_enc is not null and d.deleted_at is null"));
  let raised = 0;
  const soon = Date.now() + 3 * 86400000;
  for (const d of docs) {
    const f = JSON.parse(decryptField(d.family_id, d.extracted_enc));
    const due = f["Due date"]?.value as string | undefined;
    if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
    const at = new Date(`${due}T12:00:00+05:30`).getTime();
    if (at < Date.now() || at > soon) continue;
    raised += await service((t) => alert(t, d.family_id, "bill", `bill:${d.id}`, `A bill for ${f["Bill payee"]?.value ?? "this family"} is due ${due}.`));
  }
  return { raised };
}

/**
 * Runs the payment step for approvals whose undo window has closed. The partner is a stub:
 * no money moves, and the timeline says a person must complete it.
 */
export async function runApprovedActions(now = new Date()): Promise<{ executed: number }> {
  const rows = await service((t) => t.rows<Row>("select * from approvals where status = 'approved' and executed_at is null and undo_until < now() for update skip locked"));
  let executed = 0;
  for (const a of rows) {
    if (!canExecute({ status: a.status, undoUntil: a.undo_until, executedAt: a.executed_at }, now)) continue;
    const result = Number(a.amount_inr) > 0 ? await paymentPartner.pay({ approvalId: a.id, familyId: a.family_id, payee: a.payee ?? "", amountInr: Number(a.amount_inr) }) : { status: "no_payment", reference: "none" };
    await service(async (t) => {
      await t.run("update approvals set executed_at = now(), execution_ref = $2 where id = $1", [a.id, result.reference]);
      await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'approval','system','Desk',$2)", [a.family_id, `Approval confirmed: ${a.summary}. A coordinator will complete this. No money has moved through this system.`]);
      await t.run("insert into audit_log(action, entity, entity_id, family_id) values ('approval_step_recorded','approval',$1,$2)", [a.id, a.family_id]);
    });
    executed++;
  }
  return { executed };
}

/** Rate limit rows older than a day are of no use. */
export async function runHousekeeping() {
  await service((t) => t.run("delete from rate_limits where window_start < now() - interval '1 day'"));
}
