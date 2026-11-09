import "server-only";
import { decryptField, maskTail } from "./crypto";
import { asService, currentContext, isUuid, one, rows, run, tx, type Tx } from "./db";
import { hoursFor, isEmergency, looksLikeAdvice } from "./rules";
import type {
  Approval,
  AuditEntry,
  Claim,
  Coordinator,
  DocumentRecord,
  Family,
  Language,
  Task,
  TaskStatus,
  TimeEntry,
  TimelineEvent,
  WaitlistEntry,
  WhatsAppMessage,
} from "./types";

/**
 * Postgres-backed store. Export names match the old in-memory demo store; every function is now async.
 * All reads and writes run under the caller's identity, so RLS decides what comes back.
 * Functions that have no user (webhook, jobs, waitlist) run in the service context.
 */

type Row = Record<string, any>;

// ---------- audit ----------
export async function logAudit(_actorId: string, action: string, entity: string, entityId: string, familyId?: string, ip?: string) {
  await auditIn(undefined, action, entity, entityId, familyId, ip, _actorId);
}

async function auditIn(t: Tx | undefined, action: string, entity: string, entityId: string, familyId?: string, ip?: string, actorId?: string) {
  const ctx = await currentContext();
  const exec = (x: Tx) =>
    ctx.kind === "service"
      ? x.run("insert into audit_log(actor_id, action, entity, entity_id, family_id, ip) values ($1,$2,$3,$4,$5,$6)", [isUuid(actorId) ? actorId : null, action, entity, entityId, familyId ?? null, ip ?? null])
      : ctx.kind === "user"
        ? x.run("select audit_event($1,$2,$3,$4,$5)", [action, entity, entityId, familyId ?? null, ip ?? null])
        : Promise.resolve(0);
  return t ? exec(t) : tx(exec);
}

// ---------- families and people ----------
const FAMILY_SELECT = `
  select f.id, f.name, f.owner_id, f.coordinator_id, f.plan_usd, f.status, f.started_at,
         o.name as owner_name, o.city as owner_city, o.country as owner_country,
         p.id as parent_id, p.name as parent_name, p.city as parent_city, p.phone as parent_phone,
         p.language as parent_language, p.consent_status as parent_consent, p.is_self as parent_is_self
  from families f
  left join profiles o on o.id = f.owner_id
  left join lateral (select * from parents x where x.family_id = f.id order by x.created_at limit 1) p on true`;

function toFamily(r: Row): Family {
  return {
    id: r.id,
    name: r.name,
    owner: { id: r.owner_id, name: r.owner_name ?? "Family owner", city: r.owner_city ?? "", country: r.owner_country ?? undefined },
    parent: {
      id: r.parent_id,
      name: r.parent_name ?? "Parent",
      city: r.parent_city ?? "",
      phone: r.parent_phone ?? "",
      language: (r.parent_language ?? "English") as Language,
      consentStatus: r.parent_consent ?? "pending",
      isSelf: !!r.parent_is_self,
    },
    coordinatorId: r.coordinator_id,
    planUsd: Number(r.plan_usd),
    startedAt: r.started_at,
    status: r.status,
  };
}

export const listFamilies = async () => (await rows(`${FAMILY_SELECT} order by f.name`)).map(toFamily);

export async function getFamily(id: string) {
  if (!isUuid(id)) return undefined;
  const r = await one(`${FAMILY_SELECT} where f.id = $1`, [id]);
  return r ? toFamily(r) : undefined;
}

export async function getCoordinator(id: string | null | undefined): Promise<Coordinator | undefined> {
  if (!isUuid(id)) return undefined;
  const r = await one<Row>("select id, name, city, role, phone from profiles where id = $1", [id]);
  return r ? { id: r.id, name: r.name, city: r.city ?? "", role: r.role, phone: r.phone ?? undefined } : undefined;
}

export async function listCoordinators(): Promise<Coordinator[]> {
  const r = await rows<Row>("select id, name, city, role from profiles where role = 'coordinator' order by name");
  return r.map((x) => ({ id: x.id, name: x.name, city: x.city ?? "", role: x.role }));
}

// ---------- timeline ----------
function toEvent(r: Row): TimelineEvent {
  return { id: r.id, familyId: r.family_id, at: r.created_at, actor: r.actor, actorName: r.actor_name ?? "Desk", kind: r.kind, text: r.text };
}

export async function timeline(familyId: string) {
  if (!isUuid(familyId)) return [];
  return (await rows("select * from events where family_id = $1 order by created_at desc, id limit 200", [familyId])).map(toEvent);
}

// ---------- claims ----------
function toClaim(r: Row): Claim {
  return {
    id: r.id,
    familyId: r.family_id,
    kind: r.kind,
    status: r.status,
    hospital: r.hospital ?? "",
    amountClaimedInr: Number(r.amount_claimed_inr ?? 0),
    amountSettledInr: r.amount_settled_inr == null ? undefined : Number(r.amount_settled_inr),
    openedAt: r.opened_at,
    slaDueAt: r.sla_due_at,
    missing: (r.requirements ?? []).filter((q: Row) => !q.received_at).map((q: Row) => q.label),
    requirements: (r.requirements ?? []).map((q: Row) => ({ id: q.id, label: q.label, receivedAt: q.received_at ?? undefined, documentId: q.document_id ?? undefined })),
  };
}

export async function claimsFor(familyId: string) {
  if (!isUuid(familyId)) return [];
  const r = await rows(
    `select c.*, coalesce((select json_agg(q order by q.created_at) from claim_requirements q where q.claim_id = c.id), '[]') as requirements
     from claims c where c.family_id = $1 order by c.opened_at desc`,
    [familyId],
  );
  return r.map(toClaim);
}

// ---------- documents and policies ----------
export interface StoredField {
  value: string;
  confidence: number;
}

function toDocument(r: Row): DocumentRecord {
  let fields: Record<string, StoredField> = {};
  if (r.extracted_enc) {
    try {
      fields = JSON.parse(decryptField(r.family_id, r.extracted_enc));
    } catch {
      fields = {};
    }
  }
  return {
    id: r.id,
    familyId: r.family_id,
    kind: r.kind,
    category: r.category ?? "other",
    title: r.title,
    uploadedAt: r.created_at,
    confidence: Number(r.confidence ?? 0),
    extracted: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, k === "Policy number" ? maskTail(v.value) : v.value])),
    fieldConfidence: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.confidence])),
    preparedBy: "ai",
    checkedBy: r.checked_at ? (r.checker_name ?? "the desk") : undefined,
    consentPurposes: r.purposes ?? [],
    scanStatus: r.scan_status,
    extractionStatus: r.extraction_status,
  };
}

const DOC_SELECT = `
  select d.*, c.name as checker_name,
    coalesce((select array_agg(x.purpose order by x.purpose) from document_consents x where x.document_id = d.id and x.withdrawn_at is null), '{}') as purposes
  from documents d left join profiles c on c.id = d.checked_by`;

export async function documentsFor(familyId: string, viewerId?: string) {
  if (!isUuid(familyId)) return [];
  return tx(async (t) => {
    const r = await t.rows(`${DOC_SELECT} where d.family_id = $1 and d.deleted_at is null order by d.created_at desc`, [familyId]);
    if (r.length > 0) await auditIn(t, "view_document_list", "family", familyId, familyId, undefined, viewerId);
    return r.map(toDocument);
  });
}

export async function policyFor(familyId: string, viewerId?: string) {
  if (!isUuid(familyId)) return undefined;
  return tx(async (t) => {
    const p = await t.one<Row>("select * from policies where family_id = $1 order by renewal_date nulls last limit 1", [familyId]);
    if (!p) return undefined;
    await auditIn(t, "view_policy", "policy", p.id, familyId, undefined, viewerId);
    return {
      id: p.id as string,
      insurer: p.insurer as string,
      sumInsuredInr: Number(p.sum_insured_inr ?? 0),
      renewalDate: p.renewal_date as string,
      policyNoMasked: maskTail(decryptField(familyId, p.policy_no_enc)),
    };
  });
}

// ---------- tasks and time ----------
function toTask(r: Row): Task {
  return {
    id: r.id,
    familyId: r.family_id,
    title: r.title,
    kind: r.kind,
    status: r.status,
    ownerId: r.owner_id,
    dueAt: r.due_at,
    slaAt: r.sla_at,
    hourBudget: Number(r.hour_budget),
    needsApproval: r.needs_approval,
    checklist: r.checklist ?? [],
    documentId: r.document_id ?? undefined,
  };
}

export async function tasksFor(familyId?: string) {
  if (familyId && !isUuid(familyId)) return [];
  const r = familyId ? await rows("select * from tasks where family_id = $1", [familyId]) : await rows("select * from tasks");
  return r.map(toTask);
}

export const allTasks = () => tasksFor();

export async function getTask(id: string) {
  if (!isUuid(id)) return undefined;
  const r = await one("select * from tasks where id = $1", [id]);
  return r ? toTask(r) : undefined;
}

function toTime(r: Row): TimeEntry {
  return { id: r.id, taskId: r.task_id, familyId: r.family_id, userId: r.user_id, minutes: r.minutes, note: r.note ?? "", at: r.at };
}

export async function timeFor(familyId?: string) {
  if (familyId && !isUuid(familyId)) return [];
  const r = familyId ? await rows("select * from time_entries where family_id = $1", [familyId]) : await rows("select * from time_entries");
  return r.map(toTime);
}

export async function timeForTask(taskId: string) {
  if (!isUuid(taskId)) return [];
  return (await rows("select * from time_entries where task_id = $1 order by at desc", [taskId])).map(toTime);
}

export async function familyHours(familyId: string) {
  return hoursFor(await timeFor(familyId));
}

// ---------- approvals ----------
function toApproval(r: Row): Approval {
  return {
    id: r.id,
    familyId: r.family_id,
    taskId: r.task_id,
    summary: r.summary,
    amountInr: Number(r.amount_inr),
    payee: r.payee ?? "",
    feesInr: Number(r.fees_inr),
    when: r.when_text ?? "",
    evidenceIds: r.evidence_ids ?? [],
    status: r.status,
    decidedAt: r.decided_at ?? undefined,
    undoUntil: r.undo_until ?? undefined,
  };
}

export async function approvalsFor(familyId: string) {
  if (!isUuid(familyId)) return [];
  return (await rows("select * from approvals where family_id = $1 order by created_at", [familyId])).map(toApproval);
}

/** The database function enforces that only the family owner can decide. */
export async function decideApproval(id: string, status: "approved" | "declined", _actorId?: string) {
  if (!isUuid(id)) return undefined;
  try {
    const r = await one("select * from decide_approval($1, $2)", [id, status]);
    return r ? toApproval(r) : undefined;
  } catch {
    return undefined;
  }
}

export async function undoApproval(id: string, _actorId?: string) {
  if (!isUuid(id)) return undefined;
  try {
    const r = await one("select * from undo_approval($1)", [id]);
    return r ? toApproval(r) : undefined;
  } catch {
    return undefined;
  }
}

// ---------- ops writes ----------
export async function addTime(taskId: string, minutes: number, note: string, userId: string) {
  if (!isUuid(taskId) || minutes <= 0 || minutes > 600) return undefined;
  return tx(async (t) => {
    const task = await t.one<Row>("select id, family_id from tasks where id = $1", [taskId]);
    if (!task) return undefined;
    const r = await t.one("insert into time_entries(task_id, family_id, user_id, minutes, note) values ($1,$2,$3,$4,$5) returning *", [taskId, task.family_id, userId, Math.round(minutes), note.slice(0, 280)]);
    await auditIn(t, "log_time", "task", taskId, task.family_id, undefined, userId);
    return r ? toTime(r) : undefined;
  });
}

export async function setTaskStatus(taskId: string, status: TaskStatus, userId: string) {
  if (!isUuid(taskId)) return undefined;
  return tx(async (t) => {
    const r = await t.one("update tasks set status = $2 where id = $1 returning *", [taskId, status]);
    if (!r) return undefined;
    await auditIn(t, `task_${status}`, "task", taskId, r.family_id as string, undefined, userId);
    return toTask(r);
  });
}

// ---------- messages ----------
/** Inbound parent message: stored, emergencies flagged, never auto-answered. Service context. */
export async function receiveParentMessage(phone: string, text: string) {
  return asService(() =>
    tx(async (t) => {
      const fam = await t.one<Row>(
        `select p.id as parent_id, p.name, p.language, f.id as family_id, f.coordinator_id
         from parents p join families f on f.id = p.family_id
         where regexp_replace(p.phone, '\\D', '', 'g') = $1`,
        [phone.replace(/\D/g, "")],
      );
      if (!fam) return { matched: false as const };
      await t.run("insert into messages(family_id, direction, body, language) values ($1,'in',$2,$3)", [fam.family_id, text.slice(0, 2000), fam.language]);
      const emergency = isEmergency(text);
      await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'message','human',$2,$3)", [
        fam.family_id,
        fam.name,
        emergency ? `Message from ${fam.name} looks like an emergency. Coordinator alerted.` : `Message from ${fam.name} received.`,
      ]);
      if (emergency) {
        await t.run(
          `insert into tasks(family_id, title, kind, status, owner_id, due_at, sla_at, hour_budget, needs_approval)
           values ($1,'EMERGENCY: call the parent now','errand','todo',$2,now(),now() + interval '10 minutes',1,false)`,
          [fam.family_id, fam.coordinator_id],
        );
      }
      return { matched: true as const, familyId: fam.family_id as string, emergency };
    }),
  );
}

export async function sendCoordinatorMessage(familyId: string, body: string, userId: string) {
  if (!isUuid(familyId)) return { ok: false as const, reason: "Family not found" };
  return tx(async (t) => {
    const fam = await t.one<Row>("select p.language from families f join parents p on p.family_id = f.id where f.id = $1 limit 1", [familyId]);
    if (!fam) return { ok: false as const, reason: "Family not found" };
    if (looksLikeAdvice(body)) {
      await auditIn(t, "message_blocked_advice", "family", familyId, familyId, undefined, userId);
      return { ok: false as const, reason: "This reads like medical, legal or tax advice. Route it to a licensed professional." };
    }
    await t.run("insert into messages(family_id, direction, body, language) values ($1,'out',$2,$3)", [familyId, body.slice(0, 2000), fam.language]);
    await auditIn(t, "message_sent", "family", familyId, familyId, undefined, userId);
    return { ok: true as const };
  });
}

function toMessage(r: Row): WhatsAppMessage {
  return { id: r.id, familyId: r.family_id, direction: r.direction, body: r.body ?? "", at: r.created_at, language: r.language };
}

export async function messagesFor(familyId: string) {
  if (!isUuid(familyId)) return [];
  return (await rows("select * from messages where family_id = $1 order by created_at", [familyId])).map(toMessage);
}

// ---------- waitlist ----------
export async function addWaitlist(entry: Omit<WaitlistEntry, "id" | "at">) {
  await asService(() => run("insert into waitlist(email, country, note) values ($1,$2,$3)", [entry.email, entry.country, entry.note]));
}

export async function waitlistCount() {
  const r = await asService(() => one<{ n: number }>("select count(*)::int as n from waitlist"));
  return r?.n ?? 0;
}

// ---------- audit view ----------
export async function auditLog(familyId?: string): Promise<AuditEntry[]> {
  const r = familyId
    ? isUuid(familyId)
      ? await rows<Row>("select * from audit_log where family_id = $1 order by at desc limit 200", [familyId])
      : []
    : await rows<Row>("select * from audit_log order by at desc limit 50");
  return r.map((x) => ({ id: String(x.id), at: x.at, actorId: x.actor_id ?? "", action: x.action, entity: x.entity, entityId: x.entity_id }));
}
