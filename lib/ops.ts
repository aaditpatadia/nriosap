import "server-only";
import { isUuid, rows, tx } from "./db";
import { entriesThisMonth, breakEvenHours, hourBudget, hoursFor, isPastSla, marginPct, overHourBudget, timerMinutes, weeklyHours } from "./rules";
import { allTasks, listFamilies, timeFor } from "./store";
import type { Task } from "./types";

export type EscalationKind = "ca" | "advocate" | "hospital_desk";
export interface RunningTimer { taskId: string; familyId: string; startedAt: string; title: string }
export interface Template { id: string; name: string; kind: Task["kind"]; title: string; checklist: string[]; hourBudget: number; slaHours: number; needsApproval: boolean }
export interface PartnerContact { id: string; kind: EscalationKind; name: string; phone: string | null; email: string | null; city: string | null }
export interface TaskNote { id: string; body: string; at: string; author: string }

type Row = Record<string, any>;

export async function openAlerts(): Promise<{ id: string; kind: string; body: string }[]> {
  return (await rows<Row>("select id, kind, body from alerts where resolved_at is null order by created_at desc limit 20")).map((a) => ({ id: a.id, kind: a.kind, body: a.body }));
}

export async function resolveAlert(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return (await tx((t) => t.run("update alerts set resolved_at = now() where id = $1 and resolved_at is null", [id]))) > 0;
}

export async function runningTimer(userId: string): Promise<RunningTimer | undefined> {
  const r = (await rows<Row>("select t.task_id, t.family_id, t.started_at, k.title from timers t join tasks k on k.id = t.task_id where t.user_id = $1", [userId]))[0];
  return r ? { taskId: r.task_id, familyId: r.family_id, startedAt: r.started_at, title: r.title } : undefined;
}

export async function startTimer(taskId: string, userId: string): Promise<{ ok: boolean; startedAt?: string; reason?: string }> {
  if (!isUuid(taskId)) return { ok: false, reason: "Task not found." };
  return tx(async (t) => {
    const existing = await t.one<Row>("select task_id, started_at from timers where user_id = $1", [userId]);
    if (existing?.task_id === taskId) return { ok: true, startedAt: existing.started_at };
    if (existing) return { ok: false, reason: "You already have a timer running on another task. Stop it first." };
    const task = await t.one<Row>("select family_id from tasks where id = $1", [taskId]);
    if (!task) return { ok: false, reason: "Task not found." };
    const r = await t.one<Row>("insert into timers(user_id, task_id, family_id) values ($1,$2,$3) returning started_at", [userId, taskId, task.family_id]);
    return { ok: true, startedAt: r!.started_at };
  });
}

export async function stopTimer(taskId: string, note: string, userId: string): Promise<{ ok: boolean; minutes?: number }> {
  if (!isUuid(taskId)) return { ok: false };
  return tx(async (t) => {
    const timer = await t.one<Row>("delete from timers where user_id = $1 and task_id = $2 returning family_id, started_at, now() as stopped_at", [userId, taskId]);
    if (!timer) return { ok: false };
    const minutes = timerMinutes(new Date(timer.started_at), new Date(timer.stopped_at));
    await t.run("insert into time_entries(task_id, family_id, user_id, minutes, note, source) values ($1,$2,$3,$4,$5,'timer')", [taskId, timer.family_id, userId, minutes, note.slice(0, 280) || "Timer entry"]);
    await t.run("select audit_event('log_time','task',$1,$2)", [taskId, timer.family_id]);
    return { ok: true, minutes };
  });
}

export async function addManualTime(taskId: string, minutes: number, note: string, atIso: string, userId: string): Promise<boolean> {
  if (!isUuid(taskId)) return false;
  return tx(async (t) => {
    const task = await t.one<Row>("select family_id from tasks where id = $1", [taskId]);
    if (!task) return false;
    await t.run("insert into time_entries(task_id, family_id, user_id, minutes, note, source, at) values ($1,$2,$3,$4,$5,'manual',$6)", [taskId, task.family_id, userId, Math.round(minutes), note.slice(0, 280) || "Manual entry", atIso]);
    await t.run("select audit_event('log_time_manual','task',$1,$2)", [taskId, task.family_id]);
    return true;
  });
}

export async function notesFor(taskId: string): Promise<TaskNote[]> {
  if (!isUuid(taskId)) return [];
  const r = await rows<Row>("select n.id, n.body, n.created_at, p.name from task_notes n left join profiles p on p.id = n.author_id where n.task_id = $1 order by n.created_at desc", [taskId]);
  return r.map((x) => ({ id: x.id, body: x.body, at: x.created_at, author: x.name ?? "Desk" }));
}

export async function addNote(taskId: string, body: string, userId: string): Promise<boolean> {
  if (!isUuid(taskId)) return false;
  return tx(async (t) => {
    const task = await t.one<Row>("select family_id from tasks where id = $1", [taskId]);
    if (!task) return false;
    await t.run("insert into task_notes(task_id, family_id, author_id, body) values ($1,$2,$3,$4)", [taskId, task.family_id, userId, body.slice(0, 2000)]);
    return true;
  });
}

export async function templates(): Promise<Template[]> {
  const r = await rows<Row>("select * from task_templates order by name");
  return r.map((x) => ({ id: x.id, name: x.name, kind: x.kind, title: x.title, checklist: x.checklist, hourBudget: Number(x.hour_budget), slaHours: x.sla_hours, needsApproval: x.needs_approval }));
}

export async function createTaskFromTemplate(templateId: string, familyId: string, title: string | undefined, userId: string): Promise<string | undefined> {
  if (!isUuid(templateId) || !isUuid(familyId)) return undefined;
  return tx(async (t) => {
    const k = await t.one<Row>("select * from task_templates where id = $1", [templateId]);
    if (!k) return undefined;
    const fam = await t.one<Row>("select coordinator_id from families where id = $1", [familyId]);
    if (!fam) return undefined;
    const r = await t.one<Row>(
      `insert into tasks(family_id, kind, title, status, owner_id, due_at, sla_at, hour_budget, needs_approval, template_id, checklist)
       values ($1,$2,$3,'todo',$4, now() + ($5 || ' hours')::interval, now() + ($5 || ' hours')::interval, $6,$7,$8,$9) returning id`,
      [familyId, k.kind, title?.trim() || k.title, fam.coordinator_id ?? userId, String(k.sla_hours), k.hour_budget, k.needs_approval, k.id, k.checklist],
    );
    await t.run("select audit_event('task_created','task',$1,$2)", [r!.id, familyId]);
    return r!.id as string;
  });
}

export async function contacts(): Promise<PartnerContact[]> {
  return (await rows<Row>("select id, kind, name, phone, email, city from partner_contacts where active order by kind, name")).map((x) => ({ id: x.id, kind: x.kind, name: x.name, phone: x.phone, email: x.email, city: x.city }));
}

export const KIND_LABEL: Record<EscalationKind, string> = { ca: "CA", advocate: "Advocate", hospital_desk: "Hospital desk" };

/** Records the hand-off and returns the brief. The desk prepares the brief; the professional gives the view. */
export async function escalate(taskId: string, contactId: string, userId: string): Promise<{ ok: boolean; brief?: string; contact?: PartnerContact }> {
  if (!isUuid(taskId) || !isUuid(contactId)) return { ok: false };
  return tx(async (t) => {
    const task = await t.one<Row>("select k.id, k.title, k.family_id, f.name from tasks k join families f on f.id = k.family_id where k.id = $1", [taskId]);
    const c = await t.one<Row>("select * from partner_contacts where id = $1 and active", [contactId]);
    if (!task || !c) return { ok: false };
    const brief = `Namaste ${c.name}. The Gharsaath desk needs your professional review for ${task.name}: "${task.title}". Please reply with your own advice for the family. We will not interpret it for them.`;
    await t.run("insert into escalations(task_id, family_id, contact_id, kind, brief, created_by) values ($1,$2,$3,$4,$5,$6)", [taskId, task.family_id, contactId, c.kind, brief, userId]);
    await t.run("insert into task_notes(task_id, family_id, author_id, body) values ($1,$2,$3,$4)", [taskId, task.family_id, userId, `Escalated to ${KIND_LABEL[c.kind as EscalationKind]}: ${c.name}.`]);
    await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'system','system','Desk',$2)", [task.family_id, `Sent to a licensed professional (${KIND_LABEL[c.kind as EscalationKind]}) for their review.`]);
    await t.run("select audit_event('escalated','task',$1,$2)", [taskId, task.family_id]);
    return { ok: true, brief, contact: { id: c.id, kind: c.kind, name: c.name, phone: c.phone, email: c.email, city: c.city } };
  });
}

export interface FamilyHoursRow {
  id: string;
  name: string;
  planUsd: number;
  hours: number;
  budget: number;
  margin: number;
  breakEven: number;
  over: boolean;
  late: number;
  weeks: { weekStart: string; hours: number }[];
}

/** One row per family the viewer can see. All numbers come from lib/rules.ts. */
export async function hoursReport(now = new Date(), weeks = 8): Promise<FamilyHoursRow[]> {
  const [families, tasks, time] = await Promise.all([listFamilies(), allTasks(), timeFor()]);
  return families.map((f) => {
    const mine = time.filter((t) => t.familyId === f.id);
    const hours = hoursFor(entriesThisMonth(mine, now));
    return {
      id: f.id,
      name: f.name,
      planUsd: f.planUsd,
      hours,
      budget: hourBudget(f.planUsd),
      margin: marginPct(f.planUsd, hours),
      breakEven: breakEvenHours(f.planUsd),
      over: overHourBudget(f.planUsd, hours),
      late: tasks.filter((t) => t.familyId === f.id && isPastSla(t, now)).length,
      weeks: weeklyHours(mine, weeks, now),
    };
  });
}

/** Spreadsheet software runs cells that start with these characters as formulas. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function hoursCsv(report: FamilyHoursRow[]): string {
  const weekHead = report[0]?.weeks.map((w) => `Week of ${w.weekStart.slice(0, 10)}`) ?? [];
  const head = ["Family", "Plan USD", "Hours this month", "Hour budget", "Gross margin %", "Break-even hours", "Over budget", "Tasks past SLA", ...weekHead];
  const lines = report.map((r) => [r.name, r.planUsd, r.hours, r.budget, r.margin, r.breakEven, r.over ? "yes" : "no", r.late, ...r.weeks.map((w) => w.hours)].map(csvCell).join(","));
  return [head.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}
