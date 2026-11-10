import "server-only";
import { cache } from "react";
import { asService, isUuid, one, rows, tx } from "./db";
import type { AssistantFacts } from "./assistant";
import { familyAccess, propertiesFor, quotesForFamily, requestsFor, type FamilyAccess } from "./service-requests";
import { approvalsFor, claimsFor, documentsFor, policyFor, tasksFor, timeline } from "./store";
import { STATUS_META } from "./request-engine";
import { buildMonthlyReport, istDate, nextDue, type DeadlineKind, type MonthlyReport, type Recurrence } from "./workspace-rules";

type Row = Record<string, any>;
const iso = (d: unknown) => (d ? String(d instanceof Date ? d.toISOString() : d).slice(0, 10) : null);

// ---------- Bills, renewals and important dates ----------
export interface Deadline { id: string; familyId: string; title: string; kind: DeadlineKind; amountInr: number | null; dueOn: string; propertyId: string | null; propertyName: string | null; person: string | null; recurrence: Recurrence; documentId: string | null; status: "upcoming" | "handled" | "cancelled"; handledAt: string | null; reminderDays: number[]; reminderOn: string | null; notes: string | null }

const toDeadline = (d: Row): Deadline => ({ id: d.id, familyId: d.family_id, title: d.title, kind: d.kind, amountInr: d.amount_inr == null ? null : Number(d.amount_inr), dueOn: iso(d.due_on)!, propertyId: d.property_id, propertyName: d.property_name ?? null, person: d.person, recurrence: d.recurrence, documentId: d.document_id, status: d.status, handledAt: d.handled_at, reminderDays: d.reminder_days ?? [], reminderOn: iso(d.reminder_on), notes: d.notes });

export async function deadlinesFor(familyId: string): Promise<Deadline[]> {
  if (!isUuid(familyId)) return [];
  return (await rows<Row>("select d.*, p.name as property_name from deadlines d left join properties p on p.id = d.property_id where d.family_id = $1 and d.status <> 'cancelled' order by d.due_on", [familyId])).map(toDeadline);
}

export interface NewDeadline { title: string; kind: DeadlineKind; amountInr: number | null; dueOn: string; propertyId: string | null; person: string | null; recurrence: Recurrence; documentId: string | null; reminderDays: number[]; reminderOn: string | null; notes: string | null }

export async function addDeadline(familyId: string, d: NewDeadline, userId: string): Promise<boolean> {
  if (!(await familyAccess(familyId)).canManageBills) return false;
  return asService(() =>
    tx(async (t) => {
      // A linked property or document must belong to this same account.
      if (d.propertyId && !(await t.one("select 1 as x from properties where id = $1 and family_id = $2", [d.propertyId, familyId]))) return false;
      if (d.documentId && !(await t.one("select 1 as x from documents where id = $1 and family_id = $2 and deleted_at is null", [d.documentId, familyId]))) return false;
      const r = await t.one<Row>("insert into deadlines(family_id, title, kind, amount_inr, due_on, property_id, person, recurrence, document_id, reminder_days, reminder_on, notes, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id", [familyId, d.title, d.kind, d.amountInr, d.dueOn, d.propertyId, d.person, d.recurrence, d.documentId, d.reminderDays, d.reminderOn, d.notes, userId]);
      await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'bill','system','Desk',$2)", [familyId, `Added to your calendar: ${d.title}, due ${d.dueOn}.`]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'deadline_added','deadline',$2,$3)", [userId, r!.id, familyId]);
      return true;
    }),
  );
}

/** Marking something handled records that it is dealt with. It never means Ally paid it. A repeating item gets its next date. */
export async function setDeadlineStatus(id: string, status: "handled" | "cancelled" | "upcoming", userId: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  const d = await one<Row>("select * from deadlines where id = $1", [id]);
  if (!d || !(await familyAccess(d.family_id)).canManageBills) return null;
  await asService(() =>
    tx(async (t) => {
      await t.run("update deadlines set status = $2, handled_at = case when $2 = 'handled' then now() else null end where id = $1", [id, status]);
      const next = status === "handled" ? nextDue(iso(d.due_on)!, d.recurrence) : null;
      if (next) await t.run("insert into deadlines(family_id, title, kind, amount_inr, due_on, property_id, person, recurrence, reminder_days, notes, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [d.family_id, d.title, d.kind, d.amount_inr, next, d.property_id, d.person, d.recurrence, d.reminder_days, d.notes, userId]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,$2,'deadline',$3,$4)", [userId, `deadline_${status}`, id, d.family_id]);
    }),
  );
  return d.family_id;
}

// Once per page load, so the Overview and its calendar share one read of each list.
export const documentsOnce = cache((familyId: string) => documentsFor(familyId));
export const tasksOnce = cache((familyId: string) => tasksFor(familyId));
export const deadlinesOnce = cache((familyId: string) => deadlinesFor(familyId));
export const propertiesOnce = cache((familyId: string) => propertiesFor(familyId));
export const claimsOnce = cache((familyId: string) => claimsFor(familyId));

// ---------- One calendar across everything with a date ----------
export interface CalendarItem { date: string; label: string; kind: string; href: string }

export async function calendarFor(familyId: string, access: FamilyAccess): Promise<CalendarItem[]> {
  const full = access.owner || access.staff;
  const [deadlines, docs, policy, tasks, visits, properties, claims] = await Promise.all([access.canSeeBills ? deadlinesOnce(familyId) : [], access.canSeeVault ? documentsOnce(familyId) : [], full ? policyFor(familyId) : undefined, full ? tasksOnce(familyId) : [], access.canReadRequests ? visitsFor(familyId) : [], access.canReadRequests ? propertiesOnce(familyId) : [], full ? claimsOnce(familyId) : []]);
  const base = `/family/${familyId}`;
  const out: CalendarItem[] = [];
  for (const d of deadlines) if (d.status === "upcoming") out.push({ date: d.dueOn, label: d.title, kind: d.kind === "appointment" ? "Appointment" : "Bill or renewal", href: `${base}/bills` });
  for (const d of docs) { const e = d.expiresOn ?? null; if (e) out.push({ date: e, label: `${d.title} expires`, kind: "Document", href: `${base}/documents` }); }
  if (policy?.renewalDate) out.push({ date: iso(policy.renewalDate)!, label: `${policy.insurer} policy renews`, kind: "Insurance", href: `${base}/documents` });
  for (const t of tasks) if (t.status !== "done" && t.dueAt && (t.kind === "bill" || t.kind === "renewal")) out.push({ date: istDate(new Date(t.dueAt)), label: t.title, kind: "Bill or renewal", href: `${base}/requests` });
  for (const v of visits) if (v.status === "scheduled") out.push({ date: istDate(new Date(v.scheduledAt)), label: `Visit: ${v.purpose}`, kind: "Visit", href: v.propertyId ? `${base}/properties/${v.propertyId}` : `${base}/requests` });
  for (const p of properties) if (p.leaseEnd) out.push({ date: p.leaseEnd, label: `Rent agreement ends: ${p.name}`, kind: "Rent agreement", href: `${base}/properties/${p.id}` });
  for (const c of claims) if (c.status !== "settled" && c.slaDueAt) out.push({ date: istDate(new Date(c.slaDueAt)), label: `Claim check: ${c.hospital}`, kind: "Claim", href: `${base}/claims` });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Visits and inspection reports ----------
export interface Visit { id: string; familyId: string; propertyId: string | null; propertyName: string | null; requestId: string | null; coordinatorName: string | null; purpose: string; scheduledAt: string; status: "scheduled" | "completed" | "cancelled"; notes: string | null; issues: string | null; nextSteps: string | null; photoIds: string[]; familyName?: string }
const toVisit = (v: Row): Visit => ({ id: v.id, familyId: v.family_id, propertyId: v.property_id, propertyName: v.property_name ?? null, requestId: v.request_id, coordinatorName: v.coordinator_name ?? null, purpose: v.purpose, scheduledAt: v.scheduled_at, status: v.status, notes: v.notes, issues: v.issues, nextSteps: v.next_steps, photoIds: v.photo_document_ids ?? [], familyName: v.family_name });
export const VISIT_SELECT = `select v.*, p.name as property_name, c.name as coordinator_name, f.name as family_name from visits v left join properties p on p.id = v.property_id left join profiles c on c.id = v.coordinator_id left join families f on f.id = v.family_id`;
export const rowToVisit = toVisit;

export async function visitsFor(familyId: string): Promise<Visit[]> {
  if (!isUuid(familyId)) return [];
  return (await rows<Row>(`${VISIT_SELECT} where v.family_id = $1 order by v.scheduled_at desc`, [familyId])).map(toVisit);
}

/** Which requests each document is attached to. */
export async function relatedRequests(familyId: string): Promise<Record<string, { id: string; ref: string }[]>> {
  if (!isUuid(familyId)) return {};
  const out: Record<string, { id: string; ref: string }[]> = {};
  for (const x of await rows<Row>("select a.document_id, r.id, r.ref from request_attachments a join service_requests r on r.id = a.request_id where a.family_id = $1", [familyId])) (out[x.document_id] ??= []).push({ id: x.id, ref: x.ref });
  return out;
}

/** The same figures for the page and the PDF. */
export async function reportFor(familyId: string, month: string, category?: string, propertyId?: string): Promise<MonthlyReport> {
  const [requests, visits, documents, deadlines, quotes, events] = await Promise.all([requestsFor(familyId), visitsFor(familyId), documentsFor(familyId), deadlinesFor(familyId), quotesForFamily(familyId), timeline(familyId)]);
  return buildMonthlyReport({
    month, today: istDate(new Date()), category, propertyId: isUuid(propertyId) ? propertyId : undefined,
    requests: requests.map((r) => ({ title: r.title, ref: r.ref, status: r.status, category: r.category, propertyId: r.propertyId, createdAt: r.createdAt, completedAt: r.completedAt })),
    visits: visits.map((v) => ({ purpose: v.purpose, status: v.status, propertyId: v.propertyId, scheduledAt: v.scheduledAt, completedAt: null })),
    documents: documents.map((d) => ({ title: d.title, uploadedAt: d.uploadedAt, propertyId: d.propertyId ?? null })),
    deadlines: deadlines.map((d) => ({ title: d.title, dueOn: d.dueOn, status: d.status, handledAt: d.handledAt, propertyId: d.propertyId })),
    quotes: quotes.map((q) => ({ title: q.requestTitle ?? "Quotation", status: q.status, totalInr: q.totalInr, createdAt: q.createdAt })),
    updates: events.filter((e) => e.actor === "human").map((e) => ({ text: e.text, at: e.at })),
  });
}

// ---------- Vault details ----------
export async function setDocumentDetails(documentId: string, d: { expiresOn: string | null; issuedOn: string | null; tags: string[]; propertyId: string | null }, userId: string): Promise<string | null> {
  if (!isUuid(documentId)) return null;
  const doc = await one<Row>("select family_id from documents where id = $1 and deleted_at is null", [documentId]);
  if (!doc) return null;
  const a = await familyAccess(doc.family_id);
  if (!a.owner && !a.staff) return null;
  return asService(() =>
    tx(async (t) => {
      if (d.propertyId && !(await t.one("select 1 as x from properties where id = $1 and family_id = $2", [d.propertyId, doc.family_id]))) return null;
      await t.run("update documents set expires_on = $2, issued_on = $3, tags = $4, property_id = $5, expiry_confirmed = $2::date is not null where id = $1", [documentId, d.expiresOn, d.issuedOn, d.tags, d.propertyId]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'document_details_changed','document',$2,$3)", [userId, documentId, doc.family_id]);
      return doc.family_id as string;
    }),
  );
}

export interface AccessEntry { at: string; action: string; actor: string }
const ACTION_WORDS: Record<string, string> = { view_document: "Opened", view_document_fields: "Reviewed details", document_uploaded: "Uploaded", document_checked: "Checked details", document_shared: "Shared", document_unshared: "Stopped sharing", document_recategorised: "Moved", document_details_changed: "Changed details" };

/** Read through row security, so only people who can see the family's log get anything back. */
export async function accessLogFor(familyId: string): Promise<Record<string, AccessEntry[]>> {
  if (!isUuid(familyId)) return {};
  const r = await rows<Row>("select a.entity_id, a.action, a.at, p.name from audit_log a left join profiles p on p.id = a.actor_id where a.family_id = $1 and a.entity = 'document' order by a.at desc limit 300", [familyId]).catch(() => [] as Row[]);
  const out: Record<string, AccessEntry[]> = {};
  for (const x of r) (out[x.entity_id] ??= []).push({ at: x.at, action: ACTION_WORDS[x.action] ?? x.action, actor: x.name ?? "Ally" });
  return out;
}

// ---------- Properties ----------
export async function updateProperty(id: string, p: { ownership: string; rentInr: number | null; tenantName: string; tenantPhone: string; leaseEnd: string | null; notes: string }, userId: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  const r = await one<Row>("select family_id from properties where id = $1", [id]);
  if (!r) return null;
  const a = await familyAccess(r.family_id);
  if (!a.owner && !a.staff) return null;
  await asService(() =>
    tx(async (t) => {
      await t.run("update properties set ownership = $2, rent_inr = $3, tenant_name = $4, tenant_phone = $5, lease_end = $6, notes = $7 where id = $1", [id, p.ownership || null, p.rentInr, p.tenantName || null, p.tenantPhone || null, p.leaseEnd, p.notes || null]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'property_updated','property',$2,$3)", [userId, id, r.family_id]);
    }),
  );
  return r.family_id;
}

export async function setPropertyContact(id: string, memberId: string, linked: boolean, userId: string): Promise<string | null> {
  if (!isUuid(id) || !isUuid(memberId)) return null;
  const r = await one<Row>("select family_id from properties where id = $1", [id]);
  if (!r || !(await familyAccess(r.family_id)).owner) return null;
  return asService(() =>
    tx(async (t) => {
      if (!(await t.one("select 1 as x from family_members where id = $1 and family_id = $2 and status <> 'revoked'", [memberId, r.family_id]))) return null;
      await t.run(linked ? "update properties set contact_member_ids = array_append(array_remove(contact_member_ids, $2::uuid), $2::uuid) where id = $1" : "update properties set contact_member_ids = array_remove(contact_member_ids, $2::uuid) where id = $1", [id, memberId]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'property_contact_changed','property',$2,$3)", [userId, id, r.family_id]);
      return r.family_id as string;
    }),
  );
}

// ---------- Assistant ----------
export const assistantConsent = async (userId: string) => !!(await one<Row>("select ai_assistant_consent as c from profiles where id = $1", [userId]))?.c;
export async function setAssistantConsent(userId: string, on: boolean) {
  await asService(() => tx(async (t) => {
    await t.run("update profiles set ai_assistant_consent = $2 where id = $1", [userId, on]);
    await t.run("insert into audit_log(actor_id, action, entity, entity_id) values ($1,$2,'profile',$3)", [userId, on ? "assistant_ai_on" : "assistant_ai_off", userId]);
  }));
}

/** Gathers only what this person may see. Row security and the permission checks both apply here. */
export async function assistantFacts(familyId: string, access: FamilyAccess): Promise<AssistantFacts> {
  const full = access.owner || access.staff;
  const [requests, deadlines, docs, properties, visits, approvals] = await Promise.all([access.canReadRequests ? requestsFor(familyId) : [], access.canSeeBills ? deadlinesFor(familyId) : [], documentsFor(familyId), access.canReadRequests ? propertiesFor(familyId) : [], access.canReadRequests ? visitsFor(familyId) : [], full ? approvalsFor(familyId) : []]);
  return {
    today: istDate(new Date()),
    base: `/family/${familyId}`,
    requests: requests.map((r) => ({ id: r.id, ref: r.ref, title: r.title, status: r.status, statusLabel: STATUS_META[r.status].label, location: r.location, completedAt: r.completedAt, propertyId: r.propertyId })),
    deadlines: deadlines.map((d) => ({ id: d.id, title: d.title, dueOn: d.dueOn, status: d.status, propertyId: d.propertyId })),
    documents: docs.map((d) => ({ id: d.id, title: d.title, category: d.category, tags: d.tags, expiresOn: d.expiresOn ?? null, uploadedAt: d.uploadedAt, propertyId: d.propertyId ?? null, extracted: d.extracted })),
    properties: properties.map((p) => ({ id: p.id, name: p.name, city: p.city })),
    visits: visits.map((v) => ({ id: v.id, purpose: v.purpose, status: v.status, scheduledAt: v.scheduledAt, propertyId: v.propertyId, notes: v.notes, nextSteps: v.nextSteps })),
    approvals: approvals.filter((a) => a.status === "pending").map((a) => ({ id: a.id, summary: a.summary })),
  };
}
