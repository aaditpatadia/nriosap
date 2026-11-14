import "server-only";
import { cache } from "react";
import { asService, isUuid, one, rows, tx } from "./db";
import { looksLikeAdvice } from "./rules";
import { loadPlans } from "./plans";
import { planForPrice, requestLimitReason } from "./plan-rules";
import { monthStartIst } from "./rules";
import { readDetails, requestDetailsSchema, type RequestDetails } from "./pricing-rules";
import { isOpenStatus, requestTitle, understandRequest, type RequestStatus, type ServiceCategory, type Understanding } from "./request-engine";

type Row = Record<string, any>;

export interface ServiceRequest {
  id: string; ref: string; familyId: string; category: string; title: string; description: string; location: string | null;
  priority: "normal" | "urgent"; status: RequestStatus; coordinatorId: string | null; coordinatorName: string | null; providerName: string | null;
  taskId: string | null; understanding: Partial<Understanding>; needsProfessional: boolean; estimatedCompletion: string | null; finalReport: string | null;
  createdAt: string; updatedAt: string; completedAt: string | null; familyName?: string; partnerId: string | null; propertyId: string | null; memberId: string | null; dueOn: string | null; escalatedAt: string | null;
  details: RequestDetails;
}
export interface RequestEvent { id: string; kind: string; status: string | null; body: string; actorName: string; at: string; customerVisible: boolean }
export interface RequestAttachment { id: string; documentId: string; title: string | null; kind: "customer" | "evidence"; caption: string | null }
export interface Quotation {
  id: string; requestId: string; approvalId: string | null; providerName: string | null; providerFeeInr: number; coordinationFeeInr: number; taxesInr: number; totalInr: number;
  notes: string | null; estimatedCompletion: string | null; status: string; changeNote: string | null; createdAt: string; requestRef?: string; requestTitle?: string; undoUntil?: string; approvalStatus?: "pending" | "approved" | "declined"; approvalDeadline: string | null; documentId: string | null;
  advancePercent: number; currency: string; fxPerInr: number | null; fxAsOf: string | null; estimateId: string | null; usdPerInr: number | null; usdAsOf: string | null;
}

const SELECT = `select r.*, c.name as coordinator_name, f.name as family_name from service_requests r
  left join profiles c on c.id = r.coordinator_id left join families f on f.id = r.family_id`;

const toRequest = (r: Row): ServiceRequest => ({
  id: r.id, ref: r.ref, familyId: r.family_id, category: r.category, title: r.title, description: r.description, location: r.location, priority: r.priority, status: r.status,
  coordinatorId: r.coordinator_id, coordinatorName: r.coordinator_name ?? null, providerName: r.provider_name, taskId: r.task_id, understanding: r.understanding ?? {}, needsProfessional: r.needs_professional,
  estimatedCompletion: r.estimated_completion ? String(r.estimated_completion).slice(0, 10) : null, finalReport: r.final_report, createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at, familyName: r.family_name, partnerId: r.partner_id ?? null, propertyId: r.property_id ?? null, memberId: r.member_id ?? null, dueOn: r.due_on ?? null, escalatedAt: r.escalated_at ?? null, details: readDetails(r.details),
});
const toQuote = (q: Row): Quotation => ({
  id: q.id, requestId: q.request_id, approvalId: q.approval_id, providerName: q.provider_name, providerFeeInr: Number(q.provider_fee_inr), coordinationFeeInr: Number(q.coordination_fee_inr), taxesInr: Number(q.taxes_inr), totalInr: Number(q.total_inr),
  notes: q.notes, estimatedCompletion: q.estimated_completion ? String(q.estimated_completion).slice(0, 10) : null, status: q.status, changeNote: q.change_note, createdAt: q.created_at, requestRef: q.ref, requestTitle: q.title, undoUntil: q.undo_until ?? undefined, approvalStatus: q.approval_status ?? undefined, approvalDeadline: q.approval_deadline ?? null, documentId: q.document_id ?? null,
  advancePercent: q.advance_percent ?? 100, currency: q.currency ?? "INR", fxPerInr: q.fx_per_inr ? Number(q.fx_per_inr) : null, fxAsOf: q.fx_as_of ?? null, estimateId: q.estimate_id ?? null, usdPerInr: q.usd_per_inr ? Number(q.usd_per_inr) : null, usdAsOf: q.usd_as_of ?? null,
});

// ---------- Who may do what. Asked of Postgres as the signed-in person ----------
export interface FamilyAccess { owner: boolean; staff: boolean; canCreate: boolean; canUpload: boolean; canReadRequests: boolean; canSeeVault: boolean; canSeeActivity: boolean; canSeeBills: boolean; canManageBills: boolean; member: boolean }
const NO_ACCESS: FamilyAccess = { owner: false, staff: false, canCreate: false, canUpload: false, canReadRequests: false, canSeeVault: false, canSeeActivity: false, canSeeBills: false, canManageBills: false, member: false };

export const familyAccess = cache(async function familyAccess(familyId: string): Promise<FamilyAccess> {
  if (!isUuid(familyId)) return NO_ACCESS;
  const r = await one<Row>(
    `select public.is_family_owner($1) as owner, public.can_work_family($1) as staff, public.is_family_member($1) as member,
            public.member_can($1,'create_requests') as create_req, public.member_can($1,'upload_documents') as upload,
            public.member_can($1,'view_requests') as read_req, public.member_can($1,'view_documents') as vault, public.member_can($1,'view_activity') as activity, public.member_can($1,'view_bills') as bills, public.member_can($1,'manage_bills') as manage_bills`,
    [familyId],
  );
  if (!r) return NO_ACCESS;
  const full = r.owner || r.staff;
  return { owner: r.owner, staff: r.staff, member: r.member, canCreate: full || r.create_req, canUpload: full || r.upload, canReadRequests: full || r.read_req, canSeeVault: full || r.vault, canSeeActivity: full || r.activity, canSeeBills: full || r.bills || r.manage_bills, canManageBills: full || r.manage_bills };
});

// ---------- Customer ----------
export type CreateResult = { ok: true; id: string; ref: string } | { ok: false; reason: string };

export async function createServiceRequest(input: { familyId: string; description: string; category?: ServiceCategory; location?: string; urgent?: boolean; attachmentIds: string[]; userId: string; userName: string; propertyId?: string | null; memberId?: string | null; dueOn?: string | null; fromDesk?: boolean; details?: RequestDetails; via?: "voice"; title?: string }): Promise<CreateResult> {
  const access = await familyAccess(input.familyId);
  if (!access.canCreate) return { ok: false, reason: "You do not have permission to ask for work on this account." };
  const seen = understandRequest(input.description);
  if (seen.verdict === "not_possible") return { ok: false, reason: seen.reason ?? "We cannot take this on." };
  if (!input.fromDesk) {
    const used = await asService(() => one<Row>("select f.plan_usd, (select count(*)::int from service_requests r where r.family_id = f.id and r.created_at >= $2) as used from families f where f.id = $1", [input.familyId, monthStartIst(new Date())]));
    const limit = used && requestLimitReason(planForPrice(Number(used.plan_usd), await loadPlans()), used.used);
    if (limit) return { ok: false, reason: limit };
  }
  const category = input.category ?? seen.category;
  const linked = input.propertyId && isUuid(input.propertyId) ? await asService(() => one<Row>("select id, city from properties where id = $1 and family_id = $2", [input.propertyId, input.familyId])) : undefined;
  const person = input.memberId && isUuid(input.memberId) ? await asService(() => one<Row>("select id from family_members where id = $1 and family_id = $2 and status <> 'revoked'", [input.memberId, input.familyId])) : undefined;
  const details = input.details ? requestDetailsSchema.parse(input.details) : null;
  const location = input.location?.trim() || seen.location || linked?.city || (details && (details.pickup.area || details.pickup.pincode) ? "Mumbai" : null);
  const rushed = details?.urgency === "priority" || details?.urgency === "express";
  const priority = (input.urgent ?? seen.urgent) || rushed ? "urgent" : "normal";
  const title = input.title?.slice(0, 120) || requestTitle(input.description);
  const professional = seen.verdict === "needs_professional" || looksLikeAdvice(input.description);
  const checklist = ["Confirm exactly what is needed", "Say plainly if this cannot be done", "Send a quotation before any cost or filing"];
  if (professional) checklist.unshift("This needs a licensed professional. Do not advise. Send it to one.");
  if (input.via === "voice") checklist.unshift("Listen to the voice note first. Then fill in where, when, who and how long under Where and when, ask for anything missing, and price it.");

  const made = await asService(() =>
    tx(async (t) => {
      const f = await t.one<Row>("select coordinator_id from families where id = $1", [input.familyId]);
      if (!f) return null;
      const task = await t.one<Row>(
        `insert into tasks(family_id, kind, title, status, owner_id, due_at, sla_at, hour_budget, needs_approval, checklist)
         values ($1,'errand',$2,'todo',$3, now() + interval '1 day', now() + interval '1 day', 1, false, $4) returning id`,
        [input.familyId, `${category}: ${title}`.slice(0, 200), f.coordinator_id, checklist],
      );
      await t.run("insert into task_notes(task_id, family_id, author_id, body) values ($1,$2,$3,$4)", [task!.id, input.familyId, input.userId, input.description]);
      const r = await t.one<Row>(
        `insert into service_requests(family_id, created_by, category, title, description, location, priority, coordinator_id, task_id, understanding, needs_professional, property_id, member_id, due_on, details)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id, ref`,
        [input.familyId, input.userId, category, title, input.description, location, priority, f.coordinator_id, task!.id, JSON.stringify(input.via ? { ...seen, via: input.via } : seen), professional, linked?.id ?? null, person?.id ?? null, input.dueOn || details?.window.date || null, JSON.stringify(details ?? {})],
      );
      await t.run("insert into request_events(request_id, family_id, kind, status, body, actor_id, actor_name) values ($1,$2,'status','submitted','Request received.',$3,$4)", [r!.id, input.familyId, input.userId, input.userName]);
      for (const docId of input.attachmentIds.filter(isUuid).slice(0, 10)) {
        await t.run("insert into request_attachments(request_id, family_id, document_id, kind) select $1,$2,d.id,'customer' from documents d where d.id = $3 and d.family_id = $2 and d.deleted_at is null on conflict do nothing", [r!.id, input.familyId, docId]);
      }
      await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'system','human',$2,$3)", [input.familyId, input.userName, `New request ${r!.ref}: ${title}`]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'request_created','service_request',$2,$3)", [input.userId, r!.id, input.familyId]);
      return r as { id: string; ref: string };
    }),
  );
  return made ? { ok: true, id: made.id, ref: made.ref } : { ok: false, reason: "We could not find that account." };
}

export const requestsFor = cache(async function requestsFor(familyId: string): Promise<ServiceRequest[]> {
  if (!isUuid(familyId)) return [];
  return (await rows<Row>(`${SELECT} where r.family_id = $1 order by r.created_at desc`, [familyId])).map(toRequest);
});

export async function getRequest(id: string): Promise<ServiceRequest | undefined> {
  if (!isUuid(id)) return undefined;
  const r = await one<Row>(`${SELECT} where r.id = $1`, [id]);
  return r ? toRequest(r) : undefined;
}

export async function requestEvents(id: string): Promise<RequestEvent[]> {
  if (!isUuid(id)) return [];
  return (await rows<Row>("select * from request_events where request_id = $1 order by created_at, id", [id])).map((e) => ({ id: e.id, kind: e.kind, status: e.status, body: e.body, actorName: e.actor_name, at: e.created_at, customerVisible: e.customer_visible }));
}

export async function requestAttachments(id: string): Promise<RequestAttachment[]> {
  if (!isUuid(id)) return [];
  return (await rows<Row>("select a.*, d.title from request_attachments a left join documents d on d.id = a.document_id where a.request_id = $1 order by a.created_at", [id])).map((a) => ({ id: a.id, documentId: a.document_id, title: a.title ?? null, kind: a.kind, caption: a.caption }));
}

const QUOTE_SELECT = `select q.*, r.ref, r.title, a.undo_until, a.status as approval_status from quotations q join service_requests r on r.id = q.request_id left join approvals a on a.id = q.approval_id`;
export async function quotesForRequest(id: string): Promise<Quotation[]> {
  if (!isUuid(id)) return [];
  return (await rows<Row>(`${QUOTE_SELECT} where q.request_id = $1 order by q.created_at desc`, [id])).map(toQuote);
}
export const quotesForFamily = cache(async function quotesForFamily(familyId: string): Promise<Quotation[]> {
  if (!isUuid(familyId)) return [];
  return (await rows<Row>(`${QUOTE_SELECT} where q.family_id = $1 order by q.created_at desc`, [familyId])).map(toQuote);
});

async function logEvent(t: { run(s: string, p?: unknown[]): Promise<number> }, r: { id: string; family_id: string }, kind: string, status: string | null, body: string, actorId: string, actorName: string, visible = true) {
  await t.run("insert into request_events(request_id, family_id, kind, status, body, actor_id, actor_name, customer_visible) values ($1,$2,$3,$4,$5,$6,$7,$8)", [r.id, r.family_id, kind, status, body, actorId, actorName, visible]);
}

/** Only the family owner can cancel, and only before the work is finished. */
export async function cancelRequest(id: string, userId: string): Promise<boolean> {
  const r = await getRequest(id);
  if (!r || !isOpenStatus(r.status) || !(await familyAccess(r.familyId)).owner) return false;
  return asService(() =>
    tx(async (t) => {
      await t.run("update service_requests set status = 'cancelled', updated_at = now() where id = $1", [id]);
      await t.run("update tasks set status = 'done' where id = $1", [r.taskId]);
      await t.run("update quotations set status = 'superseded' where request_id = $1 and status = 'sent'", [id]);
      await logEvent(t, { id, family_id: r.familyId }, "status", "cancelled", "You cancelled this request.", userId, "You");
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'request_cancelled','service_request',$2,$3)", [userId, id, r.familyId]);
      return true;
    }),
  );
}

export async function disputeRequest(id: string, reason: string, userId: string): Promise<boolean> {
  const r = await getRequest(id);
  if (!r || r.status === "cancelled" || r.status === "disputed" || !(await familyAccess(r.familyId)).owner) return false;
  return asService(() =>
    tx(async (t) => {
      await t.run("update service_requests set status = 'disputed', updated_at = now() where id = $1", [id]);
      await logEvent(t, { id, family_id: r.familyId }, "status", "disputed", `You raised a problem: ${reason}`, userId, "You");
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'request_disputed','service_request',$2,$3)", [userId, id, r.familyId]);
      return true;
    }),
  );
}

export async function customerReply(id: string, body: string, userId: string, userName: string): Promise<boolean> {
  const r = await getRequest(id);
  if (!r || !isOpenStatus(r.status) || !(await familyAccess(r.familyId)).canCreate) return false;
  return asService(() =>
    tx(async (t) => {
      if (r.status === "awaiting_information" || r.status === "awaiting_customer") await t.run("update service_requests set status = 'under_review', updated_at = now() where id = $1", [id]);
      await logEvent(t, { id, family_id: r.familyId }, "message", null, body, userId, userName);
      return true;
    }),
  );
}

export async function requestQuoteChanges(quoteId: string, note: string): Promise<boolean> {
  if (!isUuid(quoteId)) return false;
  try {
    await tx((t) => t.run("select request_quote_changes($1,$2)", [quoteId, note]));
    return true;
  } catch {
    return false;
  }
}

// ---------- Desk ----------
export async function allRequests(): Promise<ServiceRequest[]> {
  return (await rows<Row>(`${SELECT} where public.can_work_family(r.family_id) order by case when r.priority = 'urgent' then 0 else 1 end, r.updated_at desc limit 200`)).map(toRequest);
}

/** Returns the request only when the signed-in person can work on that family. */
async function workable(id: string) {
  if (!isUuid(id)) return undefined;
  const r = await one<Row>("select id, family_id, status, task_id, final_report from service_requests where id = $1 and public.can_work_family(family_id)", [id]);
  return r ?? undefined;
}

const STAFF_SETTABLE: RequestStatus[] = ["under_review", "awaiting_information", "quotation_ready", "assigned", "in_progress", "awaiting_customer", "completed", "cancelled"];

export type StaffResult = { ok: boolean; reason?: string };

export async function setRequestStatus(id: string, status: RequestStatus, note: string, userId: string, userName: string): Promise<StaffResult> {
  const r = await workable(id);
  if (!r) return { ok: false, reason: "That request is not on your list." };
  if (!STAFF_SETTABLE.includes(status)) return { ok: false, reason: "Only the customer's decision can set that status." };
  if (status === "completed" && !r.final_report) return { ok: false, reason: "Write the completion report first." };
  if (["assigned", "in_progress"].includes(status)) {
    const q = await one<Row>("select count(*)::int as open from quotations where request_id = $1 and status = 'sent'", [id]);
    if (q?.open) return { ok: false, reason: "A quotation is still waiting for the customer." };
    // Paid in full first. Work starts only once a payment is confirmed with proof.
    const unpaid = await one<Row>(
      `select 1 as x from quotations q where q.request_id = $1 and q.status = 'approved' and q.advance_percent > 0
         and not exists (select 1 from payments p where p.request_id = q.request_id and p.status = 'confirmed') limit 1`,
      [id],
    );
    if (unpaid) return { ok: false, reason: "The customer pays in full before work starts. Confirm their payment first." };
  }
  return asService(() =>
    tx(async (t) => {
      await t.run("update service_requests set status = $2, updated_at = now(), completed_at = case when $2 = 'completed' then now() else completed_at end where id = $1", [id, status]);
      if (status === "completed" || status === "cancelled") await t.run("update tasks set status = 'done' where id = $1", [r.task_id]);
      await logEvent(t, r as { id: string; family_id: string }, "status", status, note || "Status updated.", userId, userName);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,$2,'service_request',$3,$4)", [userId, `request_status:${status}`, id, r.family_id]);
      return { ok: true };
    }),
  );
}

export async function assignRequest(id: string, input: { providerName?: string; coordinatorId?: string; estimatedCompletion?: string; partnerId?: string }, userId: string, userName: string): Promise<StaffResult> {
  const r = await workable(id);
  if (!r) return { ok: false, reason: "That request is not on your list." };
  let provider = input.providerName;
  if (input.partnerId) {
    const p = isUuid(input.partnerId) ? await one<Row>("select name, status from service_partners where id = $1", [input.partnerId]) : undefined;
    if (!p || p.status !== "approved") return { ok: false, reason: "Only a partner approved for use can be assigned." };
    provider = p.name;
  }
  return asService(() =>
    tx(async (t) => {
      await t.run("update service_requests set provider_name = coalesce($2, provider_name), coordinator_id = coalesce($3, coordinator_id), estimated_completion = coalesce($4::date, estimated_completion), partner_id = coalesce($5::uuid, partner_id), updated_at = now() where id = $1", [id, provider || null, input.coordinatorId || null, input.estimatedCompletion || null, input.partnerId || null]);
      if (input.coordinatorId) await t.run("update tasks set owner_id = $2 where id = $1", [r.task_id, input.coordinatorId]);
      const parts = [provider && `Provider: ${provider}`, input.estimatedCompletion && `Expected by ${input.estimatedCompletion}`, input.coordinatorId && "Coordinator updated"].filter(Boolean);
      await logEvent(t, r as { id: string; family_id: string }, "assignment", null, parts.join(". ") || "Assignment updated.", userId, userName);
      return { ok: true };
    }),
  );
}

export async function addRequestUpdate(id: string, body: string, customerVisible: boolean, userId: string, userName: string): Promise<StaffResult> {
  const r = await workable(id);
  if (!r) return { ok: false, reason: "That request is not on your list." };
  if (customerVisible && looksLikeAdvice(body)) return { ok: false, reason: "This reads like advice. Route it to a licensed professional." };
  await asService(() => tx((t) => logEvent(t, r as { id: string; family_id: string }, customerVisible ? "update" : "note", null, body, userId, userName, customerVisible)));
  return { ok: true };
}

/** The total is worked out here, never taken from the browser. Sending it creates the approval the customer decides on. */
export async function createQuotation(id: string, q: { providerName: string; providerFeeInr: number; coordinationFeeInr: number; taxesInr: number; notes: string; estimatedCompletion?: string; approvalDeadline?: string; documentId?: string; estimateId?: string }, userId: string, userName: string): Promise<StaffResult> {
  const r = await workable(id);
  if (!r) return { ok: false, reason: "That request is not on your list." };
  if (!r.task_id) return { ok: false, reason: "This request has no desk task." };
  if (looksLikeAdvice(q.notes)) return { ok: false, reason: "This reads like advice. Route it to a licensed professional." };
  const total = q.providerFeeInr + q.coordinationFeeInr + q.taxesInr;
  if (total <= 0) return { ok: false, reason: "A quotation must have an amount." };
  const req = await one<Row>("select title, ref from service_requests where id = $1", [id]);
  const est = q.estimateId && isUuid(q.estimateId) ? await one<Row>("select id, currency, fx_per_inr, fx_as_of from price_estimates where id = $1 and request_id = $2", [q.estimateId, id]) : undefined;
  // Every quotation is readable in dollars too, at the rate on the day it was made.
  const usd = await one<Row>("select per_inr, as_of from fx_rates where currency = 'USD'");
  return asService(() =>
    tx(async (t) => {
      // A new quotation replaces any that is still waiting, so only one can ever be approved.
      const old = await t.rows<Row>("update quotations set status = 'superseded' where request_id = $1 and status = 'sent' returning approval_id", [id]);
      for (const o of old) if (o.approval_id) await t.run("update approvals set status = 'declined', decided_at = now() where id = $1 and status = 'pending'", [o.approval_id]);
      const a = await t.one<Row>(
        "insert into approvals(family_id, task_id, summary, amount_inr, payee, fees_inr, when_text, requested_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
        [r.family_id, r.task_id, `${req!.ref}: ${req!.title}`.slice(0, 200), total, q.providerName || "Ally coordination", q.coordinationFeeInr + q.taxesInr, q.estimatedCompletion ? `By ${q.estimatedCompletion}` : "To be agreed", userId],
      );
      await t.run(
        "insert into quotations(request_id, family_id, approval_id, provider_name, provider_fee_inr, coordination_fee_inr, taxes_inr, total_inr, notes, estimated_completion, created_by, approval_deadline, document_id, estimate_id, currency, fx_per_inr, fx_as_of, usd_per_inr, usd_as_of) select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,(select d.id from documents d where d.id = $13::uuid and d.family_id = $2 and d.deleted_at is null),$14,$15,$16,$17,$18,$19",
        [id, r.family_id, a!.id, q.providerName || null, q.providerFeeInr, q.coordinationFeeInr, q.taxesInr, total, q.notes || null, q.estimatedCompletion || null, userId, q.approvalDeadline || null, q.documentId && isUuid(q.documentId) ? q.documentId : null, est?.id ?? null, est?.currency ?? "INR", est?.fx_per_inr ?? null, est?.fx_as_of ?? null, usd?.per_inr ?? null, usd?.as_of ?? null],
      );
      await t.run("update service_requests set status = 'awaiting_approval', provider_name = coalesce(nullif($2,''), provider_name), estimated_completion = coalesce($3::date, estimated_completion), updated_at = now() where id = $1", [id, q.providerName, q.estimatedCompletion || null]);
      await t.run("update tasks set status = 'waiting_owner', needs_approval = true where id = $1", [r.task_id]);
      await logEvent(t, r as { id: string; family_id: string }, "quote", "awaiting_approval", `Quotation sent: Rs ${total.toLocaleString("en-IN")}, paid in full before the work starts. Nothing happens until you decide.`, userId, userName);
      await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'approval','system','Desk',$2)", [r.family_id, `Waiting for your approval: ${req!.ref}`]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'quote_sent','service_request',$2,$3)", [userId, id, r.family_id]);
      return { ok: true };
    }),
  );
}

export async function attachEvidence(id: string, documentId: string, caption: string, userId: string, userName: string): Promise<StaffResult> {
  const r = await workable(id);
  if (!r || !isUuid(documentId)) return { ok: false, reason: "That request is not on your list." };
  return asService(() =>
    tx(async (t) => {
      const n = await t.run("insert into request_attachments(request_id, family_id, document_id, kind, caption) select $1,$2,d.id,'evidence',$4 from documents d where d.id = $3 and d.family_id = $2 and d.deleted_at is null on conflict (request_id, document_id) do update set kind = 'evidence', caption = excluded.caption", [id, r.family_id, documentId, caption || null]);
      if (!n) return { ok: false, reason: "That document is not in this account." };
      await logEvent(t, r as { id: string; family_id: string }, "evidence", null, caption ? `Proof added: ${caption}` : "Proof added.", userId, userName);
      return { ok: true };
    }),
  );
}

export async function saveFinalReport(id: string, report: string, userId: string, userName: string): Promise<StaffResult> {
  const r = await workable(id);
  if (!r) return { ok: false, reason: "That request is not on your list." };
  if (looksLikeAdvice(report)) return { ok: false, reason: "This reads like advice. Route it to a licensed professional." };
  await asService(() =>
    tx(async (t) => {
      await t.run("update service_requests set final_report = $2, updated_at = now() where id = $1", [id, report]);
      await logEvent(t, r as { id: string; family_id: string }, "update", null, "Completion report written.", userId, userName);
    }),
  );
  return { ok: true };
}

export async function setRequestPriority(id: string, priority: "normal" | "urgent", userId: string, userName: string): Promise<StaffResult> {
  const r = await workable(id);
  if (!r) return { ok: false, reason: "That request is not on your list." };
  await asService(() => tx(async (t) => {
    await t.run("update service_requests set priority = $2, updated_at = now() where id = $1", [id, priority]);
    await logEvent(t, r as { id: string; family_id: string }, "note", null, `Priority set to ${priority}.`, userId, userName, false);
  }));
  return { ok: true };
}

export async function escalateRequest(id: string, reason: string, userId: string, userName: string): Promise<StaffResult> {
  const r = await workable(id);
  if (!r) return { ok: false, reason: "That request is not on your list." };
  await asService(() => tx(async (t) => {
    await t.run("update service_requests set escalated_at = now(), updated_at = now() where id = $1", [id]);
    await logEvent(t, r as { id: string; family_id: string }, "note", null, `Escalated: ${reason}`, userId, userName, false);
    await t.run("insert into alerts(kind, family_id, body, dedupe_key) values ('sla', $1, $2, $3)", [r.family_id, `Request escalated: ${reason}`.slice(0, 300), `escalated:${id}:${Date.now()}`]);
    await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'request_escalated','service_request',$2,$3)", [userId, id, r.family_id]);
  }));
  return { ok: true };
}

// ---------- Properties ----------
export interface Property { id: string; name: string; kind: string; address: string | null; city: string | null; tenantName: string | null; notes: string | null; createdAt: string; ownership: string | null; rentInr: number | null; tenantPhone: string | null; leaseEnd: string | null; contactMemberIds: string[] }
export const propertiesFor = cache(async function propertiesFor(familyId: string): Promise<Property[]> {
  if (!isUuid(familyId)) return [];
  return (await rows<Row>("select * from properties where family_id = $1 order by created_at", [familyId])).map((p) => ({ id: p.id, name: p.name, kind: p.kind, address: p.address, city: p.city, tenantName: p.tenant_name, notes: p.notes, createdAt: p.created_at, ownership: p.ownership ?? null, rentInr: p.rent_inr == null ? null : Number(p.rent_inr), tenantPhone: p.tenant_phone ?? null, leaseEnd: p.lease_end ?? null, contactMemberIds: p.contact_member_ids ?? [] }));
});
export async function addProperty(familyId: string, p: { name: string; kind: string; address: string; city: string; tenantName: string; notes: string; ownership?: string; rentInr?: number | null }, userId: string): Promise<boolean> {
  const a = await familyAccess(familyId);
  if (!a.owner && !a.staff) return false;
  await asService(() =>
    tx(async (t) => {
      const r = await t.one<Row>("insert into properties(family_id, name, kind, address, city, tenant_name, notes, created_by, ownership, rent_inr) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id", [familyId, p.name, p.kind, p.address || null, p.city || null, p.tenantName || null, p.notes || null, userId, p.ownership || null, p.rentInr ?? null]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'property_added','property',$2,$3)", [userId, r!.id, familyId]);
    }),
  );
  return true;
}
export async function removeProperty(id: string, userId: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  const p = await one<Row>("select family_id from properties where id = $1", [id]);
  if (!p || !(await familyAccess(p.family_id)).owner) return null;
  await asService(() =>
    tx(async (t) => {
      await t.run("delete from properties where id = $1", [id]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'property_removed','property',$2,$3)", [userId, id, p.family_id]);
    }),
  );
  return p.family_id;
}

/** The customer, or the desk on their behalf, adds where and when. Each change is written on the timeline. */
export async function updateRequestDetails(id: string, details: RequestDetails, userId: string, userName: string): Promise<StaffResult> {
  if (!isUuid(id)) return { ok: false, reason: "Request not found." };
  const r = await one<Row>("select id, family_id, status from service_requests where id = $1", [id]);
  if (!r) return { ok: false, reason: "Request not found." };
  const access = await familyAccess(r.family_id);
  if (!access.canCreate) return { ok: false, reason: "You do not have permission to change this request." };
  if (r.status === "completed" || r.status === "cancelled") return { ok: false, reason: "This request is closed." };
  const clean = requestDetailsSchema.parse(details);
  await asService(() => tx(async (t) => {
    await t.run("update service_requests set details = $2, updated_at = now() where id = $1", [id, JSON.stringify(clean)]);
    await t.run("insert into request_events(request_id, family_id, kind, body, actor_id, actor_name, customer_visible) values ($1,$2,'update',$3,$4,$5,true)", [id, r.family_id, access.staff && !access.owner ? "The desk added the place and timing details." : "Place and timing details added.", userId, userName]);
    await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'request_details_updated','service_request',$2,$3)", [userId, id, r.family_id]);
  }));
  return { ok: true };
}
