"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionViewer, isStaff } from "@/lib/auth";
import { actionIp } from "@/lib/action-ip";
import { acceptInvite, addMember, preferencesFor, revokeMember, savePreferences, setDocumentCategory, setMemberPermissions, shareDocument } from "@/lib/family-members";
import { rateLimit } from "@/lib/ratelimit";
import { DOCUMENT_CATEGORIES, DEFAULT_PERMISSIONS, PERMISSIONS, RELATIONS, REQUEST_STATUSES, SERVICE_CATEGORIES, type DocumentCategory, type Permission, type Relation } from "@/lib/request-engine";
import { normalisePhone } from "@/lib/consent";
import {
  addProperty, addRequestUpdate, assignRequest, attachEvidence, cancelRequest, createQuotation, createServiceRequest, customerReply, disputeRequest, getRequest, removeProperty, requestQuoteChanges, saveFinalReport, setRequestStatus,
} from "@/lib/service-requests";

const id = z.string().uuid();
type Msg = { ok: boolean; message: string; link?: string } | null;
const refresh = (familyId: string) => revalidatePath(`/family/${familyId}`, "layout");
const base = () => (process.env.APP_URL ?? "").replace(/\/$/, "");

// ---------- Requests: customer ----------
const newRequest = z.object({
  familyId: id,
  description: z.string().trim().min(10, "Please say a little more about what you need.").max(2000),
  category: z.enum(SERVICE_CATEGORIES),
  location: z.string().trim().max(120),
  urgent: z.enum(["on"]).optional(),
  extra: z.string().trim().max(1000).optional(),
});

export async function submitRequest(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  if (!v) return { ok: false, message: "Please sign in again." };
  const p = newRequest.safeParse({ familyId: form.get("familyId"), description: form.get("description"), category: form.get("category"), location: form.get("location") ?? "", urgent: form.get("urgent") ?? undefined, extra: form.get("extra") ?? "" });
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Please check the form." };
  if (!(await rateLimit(`request:${v.id}`, 30, 3600))) return { ok: false, message: "That is a lot of requests. Please wait a little." };
  const attachmentIds = form.getAll("attachment").filter((x): x is string => typeof x === "string");
  const description = p.data.extra ? `${p.data.description}\n\nMore details: ${p.data.extra}` : p.data.description;
  const r = await createServiceRequest({ familyId: p.data.familyId, description, category: p.data.category, location: p.data.location, urgent: p.data.urgent === "on", attachmentIds, userId: v.id, userName: v.name });
  if (!r.ok) return { ok: false, message: r.reason };
  refresh(p.data.familyId);
  redirect(`/family/${p.data.familyId}/requests/${r.id}`);
}

export async function cancelRequestAction(requestId: string) {
  const v = await actionViewer();
  if (!v || !id.safeParse(requestId).success) return { ok: false };
  const r = await getRequest(requestId);
  const ok = await cancelRequest(requestId, v.id);
  if (r) refresh(r.familyId);
  return { ok };
}

export async function disputeAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  const p = z.object({ requestId: id, reason: z.string().trim().min(5).max(500) }).safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please tell us what went wrong." };
  const r = await getRequest(p.data.requestId);
  const ok = await disputeRequest(p.data.requestId, p.data.reason, v.id);
  if (r) refresh(r.familyId);
  return { ok, message: ok ? "Your coordinator has been told." : "That did not save." };
}

export async function replyAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  const p = z.object({ requestId: id, body: z.string().trim().min(1).max(1000) }).safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please write a message first." };
  const r = await getRequest(p.data.requestId);
  const ok = await customerReply(p.data.requestId, p.data.body, v.id, v.name);
  if (r) refresh(r.familyId);
  return { ok, message: ok ? "Sent to your coordinator." : "That did not send." };
}

export async function quoteChangesAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  const p = z.object({ quoteId: id, familyId: id, note: z.string().trim().min(3, "Please say what should change.").max(500) }).safeParse(Object.fromEntries(form));
  if (!v) return { ok: false, message: "Please sign in again." };
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Please say what should change." };
  const ok = await requestQuoteChanges(p.data.quoteId, p.data.note);
  refresh(p.data.familyId);
  return { ok, message: ok ? "Sent. Your coordinator will update the quotation." : "That did not save. The quotation may no longer be waiting." };
}

// ---------- Requests: desk ----------
async function staffUser() {
  const v = await actionViewer();
  return isStaff(v) ? v! : null;
}
const opsRefresh = (requestId: string) => { revalidatePath("/ops", "layout"); revalidatePath(`/ops/requests/${requestId}`); revalidatePath("/family", "layout"); };

export async function setStatusFormAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await staffUser();
  const p = z.object({ requestId: id, status: z.enum(REQUEST_STATUSES), note: z.string().trim().max(500) }).safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please check the form." };
  const r = await setRequestStatus(p.data.requestId, p.data.status, p.data.note, v.id, v.name);
  opsRefresh(p.data.requestId);
  return { ok: r.ok, message: r.ok ? "Status updated." : (r.reason ?? "That did not save.") };
}

export async function assignAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await staffUser();
  const p = z.object({ requestId: id, providerName: z.string().trim().max(120), estimatedCompletion: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/), coordinatorId: z.union([id, z.literal("")]).optional() }).safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please check the form." };
  // Only an admin can move a request to another coordinator.
  const r = await assignRequest(p.data.requestId, { providerName: p.data.providerName, estimatedCompletion: p.data.estimatedCompletion, coordinatorId: v.role === "admin" ? p.data.coordinatorId : undefined }, v.id, v.name);
  opsRefresh(p.data.requestId);
  return { ok: r.ok, message: r.ok ? "Saved." : (r.reason ?? "That did not save.") };
}

export async function updateAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await staffUser();
  const p = z.object({ requestId: id, body: z.string().trim().min(1).max(1000), internal: z.enum(["on"]).optional() }).safeParse({ requestId: form.get("requestId"), body: form.get("body"), internal: form.get("internal") ?? undefined });
  if (!v || !p.success) return { ok: false, message: "Please write something first." };
  const r = await addRequestUpdate(p.data.requestId, p.data.body, p.data.internal !== "on", v.id, v.name);
  opsRefresh(p.data.requestId);
  return { ok: r.ok, message: r.ok ? "Saved." : (r.reason ?? "That did not save.") };
}

const rupees = z.coerce.number().int("Whole rupees only.").min(0).max(100000000);
export async function quoteAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await staffUser();
  const p = z.object({ requestId: id, providerName: z.string().trim().max(120), providerFee: rupees, coordinationFee: rupees, taxes: rupees, notes: z.string().trim().max(1000), estimatedCompletion: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/) }).safeParse(Object.fromEntries(form));
  if (!v) return { ok: false, message: "Please sign in again." };
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Please check the amounts." };
  const r = await createQuotation(p.data.requestId, { providerName: p.data.providerName, providerFeeInr: p.data.providerFee, coordinationFeeInr: p.data.coordinationFee, taxesInr: p.data.taxes, notes: p.data.notes, estimatedCompletion: p.data.estimatedCompletion }, v.id, v.name);
  opsRefresh(p.data.requestId);
  return { ok: r.ok, message: r.ok ? "Sent to the customer. Nothing happens until they decide." : (r.reason ?? "That did not save.") };
}

export async function evidenceAction(requestId: string, documentId: string, caption: string) {
  const v = await staffUser();
  const p = z.object({ requestId: id, documentId: id, caption: z.string().trim().max(200) }).safeParse({ requestId, documentId, caption });
  if (!v || !p.success) return { ok: false, reason: "Please check the file." };
  const r = await attachEvidence(p.data.requestId, p.data.documentId, p.data.caption, v.id, v.name);
  opsRefresh(p.data.requestId);
  return r;
}

export async function reportAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await staffUser();
  const p = z.object({ requestId: id, report: z.string().trim().min(10, "Please describe what was done.").max(4000) }).safeParse(Object.fromEntries(form));
  if (!v) return { ok: false, message: "Please sign in again." };
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Please check the report." };
  const r = await saveFinalReport(p.data.requestId, p.data.report, v.id, v.name);
  opsRefresh(p.data.requestId);
  return { ok: r.ok, message: r.ok ? "Report saved." : (r.reason ?? "That did not save.") };
}

// ---------- Properties ----------
export async function addPropertyAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  const p = z.object({ familyId: id, name: z.string().trim().min(2, "Please give it a name.").max(120), kind: z.enum(["flat", "house", "plot", "shop", "vehicle", "other"]), address: z.string().trim().max(300), city: z.string().trim().max(80), tenantName: z.string().trim().max(120), notes: z.string().trim().max(1000) }).safeParse(Object.fromEntries(form));
  if (!v) return { ok: false, message: "Please sign in again." };
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Please check the form." };
  const ok = await addProperty(p.data.familyId, p.data, v.id);
  refresh(p.data.familyId);
  return { ok, message: ok ? "Added." : "Only the account owner can add this." };
}

export async function removePropertyAction(propertyId: string) {
  const v = await actionViewer();
  if (!v || !id.safeParse(propertyId).success) return { ok: false };
  const fam = await removeProperty(propertyId, v.id);
  if (fam) refresh(fam);
  return { ok: !!fam };
}

// ---------- Family ----------
const permissionKeys = Object.keys(PERMISSIONS) as Permission[];
const pickPermissions = (form: FormData) => form.getAll("permission").filter((x): x is Permission => permissionKeys.includes(x as Permission));

export async function addMemberAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  const p = z.object({
    familyId: id,
    name: z.string().trim().min(2, "Please enter their name.").max(120),
    relation: z.enum(Object.keys(RELATIONS) as [Relation, ...Relation[]]),
    email: z.union([z.string().trim().email("That email does not look right.").max(200), z.literal("")]),
    phone: z.string().trim().max(24),
    language: z.enum(["Hindi", "Gujarati", "Marathi", "English"]),
    access: z.enum(["invite", "contact"]),
  }).safeParse({ familyId: form.get("familyId"), name: form.get("name"), relation: form.get("relation"), email: form.get("email") ?? "", phone: form.get("phone") ?? "", language: form.get("language"), access: form.get("access") });
  if (!v) return { ok: false, message: "Please sign in again." };
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Please check the form." };
  const phone = p.data.phone ? normalisePhone(p.data.phone) : null;
  if (p.data.phone && !phone) return { ok: false, message: "Please enter the WhatsApp number with its country code, like +91 98000 00000." };
  if (p.data.access === "contact" && !phone) return { ok: false, message: "A contact without an account needs a WhatsApp number." };
  if (!(await rateLimit(`invite:${v.id}`, 30, 3600))) return { ok: false, message: "That is a lot of invitations. Please wait a little." };
  const chosen = pickPermissions(form);
  const r = await addMember({ familyId: p.data.familyId, name: p.data.name, relation: p.data.relation, permissions: chosen.length ? chosen : DEFAULT_PERMISSIONS[p.data.relation], email: p.data.email, phone, language: p.data.language, whatsappOk: form.get("whatsappOk") === "on", isEmergency: form.get("isEmergency") === "on", invite: p.data.access === "invite", userId: v.id, base: base() });
  if (!r.ok) return { ok: false, message: r.reason };
  refresh(p.data.familyId);
  return { ok: true, message: r.inviteLink ? "Added. Send them this link. It works once and lasts 7 days." : "Added.", link: r.inviteLink };
}

export async function memberPermissionsAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  const memberId = id.safeParse(form.get("memberId"));
  if (!v || !memberId.success) return { ok: false, message: "Please sign in again." };
  const fam = await setMemberPermissions(memberId.data, pickPermissions(form), v.id);
  if (fam) refresh(fam);
  return { ok: !!fam, message: fam ? "Saved." : "Only the account owner can change this." };
}

export async function revokeMemberAction(memberId: string) {
  const v = await actionViewer();
  if (!v || !id.safeParse(memberId).success) return { ok: false };
  const fam = await revokeMember(memberId, v.id);
  if (fam) refresh(fam);
  return { ok: !!fam };
}

export async function acceptInviteAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  if (!v) return { ok: false, message: "Please sign in first." };
  if (!(await rateLimit(`accept:${await actionIp()}`, 20, 600))) return { ok: false, message: "Too many tries. Please wait a few minutes." };
  const r = await acceptInvite(String(form.get("token") ?? "").slice(0, 100), { id: v.id, email: v.email });
  if (!r.ok) return { ok: false, message: r.reason };
  redirect(`/family/${r.familyId}`);
}

export async function shareDocumentAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  const p = z.object({ documentId: id, memberId: id, share: z.enum(["1", "0"]) }).safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please choose a person." };
  const fam = await shareDocument(p.data.documentId, p.data.memberId, p.data.share === "1", v.id);
  if (fam) refresh(fam);
  return { ok: !!fam, message: fam ? "Saved." : "Only the account owner can share this." };
}

export async function setDocumentCategoryAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  const p = z.object({ documentId: id, category: z.enum(Object.keys(DOCUMENT_CATEGORIES) as [DocumentCategory, ...DocumentCategory[]]) }).safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please choose a category." };
  const fam = await setDocumentCategory(p.data.documentId, p.data.category, v.id);
  if (fam) refresh(fam);
  return { ok: !!fam, message: fam ? "Moved." : "Only the account owner can change this." };
}

// ---------- Settings ----------
export async function savePreferencesAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  if (!v) return { ok: false, message: "Please sign in again." };
  const p = z.object({ country: z.string().trim().max(80), cities: z.string().trim().max(300), language: z.enum(["Hindi", "Gujarati", "Marathi", "English"]), channel: z.enum(["whatsapp", "email", "app"]), timezone: z.string().trim().max(60) }).safeParse({ country: form.get("country") ?? "", cities: form.get("cities") ?? "", language: form.get("language"), channel: form.get("channel"), timezone: form.get("timezone") ?? "" });
  if (!p.success) return { ok: false, message: "Please check the form." };
  const current = await preferencesFor(v.id);
  await savePreferences(v.id, { ...current, country: p.data.country || null, indiaCities: p.data.cities.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 10), language: p.data.language, channel: p.data.channel, timezone: p.data.timezone || null, notifyUpdates: form.get("notifyUpdates") === "on" });
  revalidatePath("/family", "layout");
  return { ok: true, message: "Saved." };
}
