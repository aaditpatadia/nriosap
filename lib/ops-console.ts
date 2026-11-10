import "server-only";
import { asService, isUuid, one, rows, tx } from "./db";
import { loadPlans } from "./plans";
import { planForPrice, visitBlockedReason } from "./plan-rules";
import { monthStartIst, isPastSla } from "./rules";
import { allRequests, createServiceRequest } from "./service-requests";
import { allTasks, listCoordinators, listFamilies, timeFor } from "./store";
import { isOpenStatus } from "./request-engine";
import { partnerMoveProblem, istDate, type PartnerStatus } from "./workspace-rules";
import { rowToVisit, VISIT_SELECT, type Visit } from "./workspace";

type Row = Record<string, any>;
export type Result = { ok: boolean; reason?: string };

// ---------- Overview. Every number is counted from rows this person can work on ----------
export async function allVisits(): Promise<Visit[]> {
  return (await rows<Row>(`${VISIT_SELECT} where public.can_work_family(v.family_id) order by v.scheduled_at desc limit 300`)).map(rowToVisit);
}

export async function opsOverview(now = new Date()) {
  const [families, requests, tasks, visits, coordinators, time] = await Promise.all([listFamilies(), allRequests(), allTasks(), allVisits(), listCoordinators(), timeFor()]);
  const monthStart = monthStartIst(now);
  const today = istDate(now);
  const open = requests.filter((r) => isOpenStatus(r.status));
  const doneTasks = tasks.filter((t) => t.status === "done");
  return {
    families: families.filter((f) => f.status !== "deleted").length,
    openRequests: open.length,
    overdue: tasks.filter((t) => isPastSla(t, now)).length,
    awaitingApproval: requests.filter((r) => r.status === "awaiting_approval").length,
    awaitingInformation: requests.filter((r) => r.status === "awaiting_information").length,
    visitsToday: visits.filter((v) => v.status === "scheduled" && istDate(new Date(v.scheduledAt)) === today).length,
    completedThisMonth: requests.filter((r) => r.completedAt && new Date(r.completedAt) >= monthStart).length + doneTasks.filter((t) => !requests.some((r) => r.taskId === t.id) && time.some((e) => e.taskId === t.id && new Date(e.at) >= monthStart)).length,
    workload: coordinators.map((c) => ({ id: c.id, name: c.name, open: tasks.filter((t) => t.ownerId === c.id && t.status !== "done").length, late: tasks.filter((t) => t.ownerId === c.id && isPastSla(t, now)).length })).sort((a, b) => b.open - a.open),
    newest: open.slice(0, 6),
  };
}

// ---------- Coordinators. Counts only; there is no score ----------
export async function coordinatorStats(now = new Date()) {
  const [coordinators, families, tasks, visits, time] = await Promise.all([listCoordinators(), listFamilies(), allTasks(), allVisits(), timeFor()]);
  const monthStart = monthStartIst(now);
  return coordinators.map((c) => {
    const mine = tasks.filter((t) => t.ownerId === c.id);
    return {
      id: c.id, name: c.name, city: c.city,
      families: families.filter((f) => f.coordinatorId === c.id).length,
      pending: mine.filter((t) => t.status !== "done").length,
      completed: mine.filter((t) => t.status === "done").length,
      pastSla: mine.filter((t) => isPastSla(t, now)).length,
      visits: visits.filter((v) => v.status === "scheduled" && v.coordinatorName === c.name).length,
      hours: Math.round(time.filter((e) => e.userId === c.id && new Date(e.at) >= monthStart).reduce((s, e) => s + e.minutes, 0) / 6) / 10,
    };
  });
}

// ---------- Service partners ----------
export interface Partner { id: string; name: string; category: string; city: string | null; phone: string | null; email: string | null; status: PartnerStatus; availability: string | null; notes: string | null; identityChecked: boolean; referencesChecked: boolean; jobs: number; feedback: { body: string; at: string; author: string }[] }

export async function partners(): Promise<Partner[]> {
  const [list, fb, jobs] = await Promise.all([
    rows<Row>("select * from service_partners order by name"),
    rows<Row>("select f.partner_id, f.body, f.created_at, p.name from partner_feedback f left join profiles p on p.id = f.author_id order by f.created_at desc limit 200"),
    rows<Row>("select partner_id, count(*)::int as n from service_requests where partner_id is not null group by partner_id"),
  ]);
  return list.map((p) => ({ id: p.id, name: p.name, category: p.category, city: p.city, phone: p.phone, email: p.email, status: p.status, availability: p.availability, notes: p.notes, identityChecked: !!p.identity_checked_at, referencesChecked: !!p.references_checked_at, jobs: jobs.find((j) => j.partner_id === p.id)?.n ?? 0, feedback: fb.filter((f) => f.partner_id === p.id).map((f) => ({ body: f.body, at: f.created_at, author: f.name ?? "Desk" })) }));
}

export async function addPartner(p: { name: string; category: string; city: string; phone: string; email: string; availability: string; notes: string }, userId: string): Promise<void> {
  await asService(() => tx(async (t) => {
    const r = await t.one<Row>("insert into service_partners(name, category, city, phone, email, availability, notes, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id", [p.name, p.category, p.city || null, p.phone || null, p.email || null, p.availability || null, p.notes || null, userId]);
    await t.run("insert into audit_log(actor_id, action, entity, entity_id) values ($1,'partner_added','service_partner',$2)", [userId, r!.id]);
  }));
}

/** The status records a check somebody has done, with their name and the time. Only an admin can call this. */
export async function movePartner(id: string, to: PartnerStatus, userId: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, reason: "Partner not found." };
  return asService(() => tx(async (t) => {
    const p = await t.one<Row>("select * from service_partners where id = $1 for update", [id]);
    if (!p) return { ok: false, reason: "Partner not found." };
    const identity = !!p.identity_checked_at || to === "identity_checked";
    const references = !!p.references_checked_at || to === "references_checked";
    const problem = partnerMoveProblem({ identityChecked: identity, referencesChecked: references }, to);
    if (problem) return { ok: false, reason: problem };
    await t.run(`update service_partners set status = $2,
      identity_checked_at = case when $2 = 'identity_checked' then now() else identity_checked_at end, identity_checked_by = case when $2 = 'identity_checked' then $3::uuid else identity_checked_by end,
      references_checked_at = case when $2 = 'references_checked' then now() else references_checked_at end, references_checked_by = case when $2 = 'references_checked' then $3::uuid else references_checked_by end,
      approved_at = case when $2 = 'approved' then now() else approved_at end, approved_by = case when $2 = 'approved' then $3::uuid else approved_by end where id = $1`, [id, to, userId]);
    await t.run("insert into audit_log(actor_id, action, entity, entity_id) values ($1,$2,'service_partner',$3)", [userId, `partner_${to}`, id]);
    return { ok: true };
  }));
}

export async function addPartnerFeedback(id: string, body: string, userId: string): Promise<void> {
  if (!isUuid(id)) return;
  await asService(() => tx((t) => t.run("insert into partner_feedback(partner_id, body, author_id) values ($1,$2,$3)", [id, body, userId])));
}

// ---------- Visits ----------
export async function scheduleVisit(v: { familyId: string; propertyId: string | null; requestId: string | null; purpose: string; scheduledAt: string }, userId: string, name: string): Promise<Result> {
  if (!isUuid(v.familyId)) return { ok: false, reason: "Please choose a family." };
  const f = await one<Row>("select plan_usd, coordinator_id from families where id = $1 and public.can_work_family(id)", [v.familyId]);
  if (!f) return { ok: false, reason: "That family is not on your list." };
  const approved = v.requestId && isUuid(v.requestId) ? await one<Row>("select 1 as x from quotations where request_id = $1 and family_id = $2 and status = 'approved'", [v.requestId, v.familyId]) : undefined;
  const blocked = visitBlockedReason(planForPrice(Number(f.plan_usd), await loadPlans()), !!approved);
  if (blocked) return { ok: false, reason: blocked };
  return asService(() => tx(async (t) => {
    if (v.propertyId && !(await t.one("select 1 as x from properties where id = $1 and family_id = $2", [v.propertyId, v.familyId]))) return { ok: false, reason: "That property is not on this account." };
    if (v.requestId && !(await t.one("select 1 as x from service_requests where id = $1 and family_id = $2", [v.requestId, v.familyId]))) return { ok: false, reason: "That request is not on this account." };
    const r = await t.one<Row>("insert into visits(family_id, property_id, request_id, coordinator_id, purpose, scheduled_at, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning id", [v.familyId, v.propertyId, v.requestId, f.coordinator_id ?? userId, v.purpose, v.scheduledAt, userId]);
    await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'visit','human',$2,$3)", [v.familyId, name, `Visit scheduled: ${v.purpose}.`]);
    await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'visit_scheduled','visit',$2,$3)", [userId, r!.id, v.familyId]);
    return { ok: true };
  }));
}

export async function completeVisit(id: string, report: { notes: string; issues: string; nextSteps: string; photoIds: string[]; followUp: string }, userId: string, name: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, reason: "Visit not found." };
  const v = await one<Row>("select id, family_id, purpose, status from visits where id = $1 and public.can_work_family(family_id)", [id]);
  if (!v) return { ok: false, reason: "That visit is not on your list." };
  let follow: string | null = null;
  if (report.followUp) {
    const r = await createServiceRequest({ familyId: v.family_id, description: report.followUp, attachmentIds: [], userId, userName: name, fromDesk: true });
    if (!r.ok) return { ok: false, reason: r.reason };
    follow = r.id;
  }
  return asService(() => tx(async (t) => {
    const photos = report.photoIds.length ? (await t.rows<Row>("select id from documents where id = any($1::uuid[]) and family_id = $2 and deleted_at is null", [report.photoIds, v.family_id])).map((d) => d.id) : [];
    await t.run("update visits set status = 'completed', completed_at = now(), notes = $2, issues = $3, next_steps = $4, photo_document_ids = $5, follow_up_request_id = $6 where id = $1", [id, report.notes, report.issues || null, report.nextSteps || null, photos, follow]);
    await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'visit','human',$2,$3)", [v.family_id, name, `Visit report added: ${v.purpose}.`]);
    await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'visit_completed','visit',$2,$3)", [userId, id, v.family_id]);
    return { ok: true };
  }));
}

// ---------- Lists across families ----------
export const allProperties = async () => (await rows<Row>("select p.*, f.name as family_name from properties p join families f on f.id = p.family_id where public.can_work_family(p.family_id) order by f.name, p.name")).map((p) => ({ id: p.id, familyId: p.family_id, familyName: p.family_name, name: p.name, kind: p.kind, city: p.city, tenantName: p.tenant_name }));

export const documentReviewQueue = async () => (await rows<Row>("select d.id, d.family_id, d.title, d.confidence, d.extraction_status, d.created_at, f.name as family_name from documents d join families f on f.id = d.family_id where public.can_work_family(d.family_id) and d.deleted_at is null and d.checked_at is null and d.extraction_status in ('failed','done') and coalesce(d.confidence,0) < 0.9 order by d.created_at limit 100")).map((d) => ({ id: d.id, familyId: d.family_id, title: d.title, confidence: Number(d.confidence ?? 0), status: d.extraction_status, at: d.created_at, familyName: d.family_name }));

export const allQuotes = async () => (await rows<Row>("select q.*, r.ref, r.title, f.name as family_name from quotations q join service_requests r on r.id = q.request_id join families f on f.id = q.family_id where public.can_work_family(q.family_id) order by q.created_at desc limit 200")).map((q) => ({ id: q.id, requestId: q.request_id, ref: q.ref, title: q.title, familyName: q.family_name, totalInr: Number(q.total_inr), status: q.status as string, at: q.created_at, deadline: q.approval_deadline ? String(q.approval_deadline).slice(0, 10) : null, changeNote: q.change_note as string | null }));

// ---------- Saved views in the queue ----------
export const savedFilters = async (userId: string) => (await rows<Row>("select id, name, query from saved_filters where user_id = $1 order by created_at", [userId])).map((f) => ({ id: f.id as string, name: f.name as string, query: f.query as string }));
export async function saveFilter(userId: string, name: string, query: string) { await asService(() => tx((t) => t.run("insert into saved_filters(user_id, name, query) values ($1,$2,$3)", [userId, name, query]))); }
export async function deleteFilter(userId: string, id: string) { if (isUuid(id)) await asService(() => tx((t) => t.run("delete from saved_filters where id = $1 and user_id = $2", [id, userId]))); }
