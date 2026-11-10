"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionViewer, isStaff } from "@/lib/auth";
import { addPartner, addPartnerFeedback, completeVisit, deleteFilter, movePartner, saveFilter, scheduleVisit } from "@/lib/ops-console";
import { savePlan } from "@/lib/plans";
import { escalateRequest, setRequestPriority } from "@/lib/service-requests";
import { PARTNER_STATUSES, type PartnerStatus } from "@/lib/workspace-rules";

const id = z.string().uuid();
const optionalId = z.union([id, z.literal("")]);
type Msg = { ok: boolean; message: string } | null;
const refresh = () => { revalidatePath("/ops", "layout"); revalidatePath("/family", "layout"); };
async function staff() { const v = await actionViewer(); return isStaff(v) ? v! : null; }
async function admin() { const v = await actionViewer(); return v?.role === "admin" ? v : null; }

export async function addPartnerAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await staff();
  const p = z.object({ name: z.string().trim().min(2, "Please enter a name.").max(120), category: z.string().trim().min(2, "Please enter a service.").max(80), city: z.string().trim().max(80), phone: z.string().trim().max(24), email: z.union([z.string().trim().email("That email does not look right.").max(200), z.literal("")]), availability: z.string().trim().max(200), notes: z.string().trim().max(1000) }).safeParse(Object.fromEntries(form));
  if (!v) return { ok: false, message: "Please sign in again." };
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Please check the form." };
  await addPartner(p.data, v.id);
  refresh();
  return { ok: true, message: "Added as not reviewed." };
}

export async function movePartnerAction(partnerId: string, to: PartnerStatus) {
  const v = await admin();
  if (!v) return { ok: false, reason: "Only an admin can change this." };
  if (!id.safeParse(partnerId).success || !(to in PARTNER_STATUSES) || to === "not_reviewed") return { ok: false, reason: "That is not a valid change." };
  const r = await movePartner(partnerId, to, v.id);
  refresh();
  return r;
}

export async function partnerFeedbackAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await staff();
  const p = z.object({ partnerId: id, body: z.string().trim().min(3, "Please write something.").max(500) }).safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please write something." };
  await addPartnerFeedback(p.data.partnerId, p.data.body, v.id);
  refresh();
  return { ok: true, message: "Saved." };
}

export async function scheduleVisitAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await staff();
  const p = z.object({ familyId: id, propertyId: optionalId, requestId: optionalId, purpose: z.string().trim().min(3, "Please say what the visit is for.").max(200), when: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Please choose a date and time.") }).safeParse({ familyId: form.get("familyId"), propertyId: form.get("propertyId") ?? "", requestId: form.get("requestId") ?? "", purpose: form.get("purpose"), when: form.get("when") });
  if (!v) return { ok: false, message: "Please sign in again." };
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Please check the form." };
  const r = await scheduleVisit({ familyId: p.data.familyId, propertyId: p.data.propertyId || null, requestId: p.data.requestId || null, purpose: p.data.purpose, scheduledAt: `${p.data.when}:00+05:30` }, v.id, v.name);
  refresh();
  return { ok: r.ok, message: r.ok ? "Visit scheduled." : (r.reason ?? "That did not save.") };
}

export async function completeVisitAction(visitId: string, input: { notes: string; issues: string; nextSteps: string; photoIds: string[]; followUp: string }) {
  const v = await staff();
  const p = z.object({ notes: z.string().trim().min(3).max(4000), issues: z.string().trim().max(2000), nextSteps: z.string().trim().max(2000), photoIds: z.array(id).max(20), followUp: z.union([z.string().trim().min(10).max(2000), z.literal("")]) }).safeParse(input);
  if (!v || !p.success || !id.safeParse(visitId).success) return { ok: false, reason: "Please write what was found. A follow-up needs at least 10 characters." };
  const r = await completeVisit(visitId, p.data, v.id, v.name);
  refresh();
  return r;
}

export async function priorityAction(requestId: string, priority: "normal" | "urgent") {
  const v = await staff();
  if (!v || !id.safeParse(requestId).success || !["normal", "urgent"].includes(priority)) return { ok: false };
  const r = await setRequestPriority(requestId, priority, v.id, v.name);
  refresh();
  return r;
}

export async function escalateAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await staff();
  const p = z.object({ requestId: id, reason: z.string().trim().min(5, "Please say why.").max(500) }).safeParse(Object.fromEntries(form));
  if (!v) return { ok: false, message: "Please sign in again." };
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Please say why." };
  const r = await escalateRequest(p.data.requestId, p.data.reason, v.id, v.name);
  refresh();
  return { ok: r.ok, message: r.ok ? "Escalated." : (r.reason ?? "That did not save.") };
}

export async function saveFilterAction(form: FormData) {
  const v = await staff();
  const p = z.object({ name: z.string().trim().min(1).max(60), query: z.string().max(400) }).safeParse(Object.fromEntries(form));
  if (v && p.success) { await saveFilter(v.id, p.data.name, p.data.query); revalidatePath("/ops/queue"); }
}

export async function deleteFilterAction(filterId: string) {
  const v = await staff();
  if (v) { await deleteFilter(v.id, filterId); revalidatePath("/ops/queue"); }
}

export async function savePlanAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await admin();
  const p = z.object({ slug: z.string().max(40), name: z.string().trim().min(2).max(40), price: z.coerce.number().min(0).max(9999), blurb: z.string().trim().max(200), features: z.string().trim().max(1500), limit: z.union([z.literal(""), z.coerce.number().int().min(0).max(1000)]) }).safeParse(Object.fromEntries(form));
  if (!v) return { ok: false, message: "Only an admin can change plans." };
  if (!p.success) return { ok: false, message: "Please check the form." };
  const ok = await savePlan(p.data.slug, { name: p.data.name, priceUsd: p.data.price, blurb: p.data.blurb, features: p.data.features.split("\n").map((f) => f.trim()).filter(Boolean).slice(0, 12), requestsPerMonth: p.data.limit === "" ? null : p.data.limit, includesVisits: form.get("visits") === "on", priorityResponse: form.get("priority") === "on" }, v.id);
  revalidatePath("/");
  refresh();
  return { ok, message: ok ? "Saved. The public site updates within 5 minutes." : "That did not save." };
}

export async function goToQueue(form: FormData) {
  redirect(`/ops/queue?${new URLSearchParams([...form.entries()].filter(([, v]) => typeof v === "string" && v) as [string, string][]).toString()}`);
}
