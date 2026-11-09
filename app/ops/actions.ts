"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionViewer, isStaff } from "@/lib/auth";
import { addManualTime, addNote, createTaskFromTemplate, escalate, resolveAlert, startTimer, stopTimer } from "@/lib/ops";
import { normalisePhone, PLAN_PRICES } from "@/lib/consent";
import { addClaim, addRequirement, confirmParentConsent, createFamily, ensureOwner, pauseForCounsel, requestApproval, setClaimStatus, setRequirementReceived } from "@/lib/onboarding";
import { looksLikeAdvice } from "@/lib/rules";
import { PURPOSES, type Purpose } from "@/lib/upload-rules";
import { saveCheck } from "@/lib/vault";
import { approveAndSend, saveDraft, sendTemplateMessage, TEMPLATES, type TemplateName } from "@/lib/wa-outbound";

const id = z.string().uuid();

async function staff() {
  const v = await actionViewer();
  return isStaff(v) ? v! : null;
}

export async function startTimerAction(taskId: string) {
  const v = await staff();
  if (!v || !id.safeParse(taskId).success) return { ok: false as const, reason: "Please sign in again." };
  const r = await startTimer(taskId, v.id);
  revalidatePath("/ops", "layout");
  return r;
}

export async function stopTimerAction(taskId: string, note: string) {
  const v = await staff();
  if (!v || !id.safeParse(taskId).success) return { ok: false as const };
  const r = await stopTimer(taskId, String(note ?? "").slice(0, 280), v.id);
  revalidatePath("/ops", "layout");
  return r;
}

const manual = z.object({
  taskId: id,
  hours: z.coerce.number().min(0).max(10),
  minutes: z.coerce.number().int().min(0).max(59),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(280),
});

export async function manualTimeAction(_prev: unknown, form: FormData) {
  const v = await staff();
  const p = manual.safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please check the time and date." };
  const total = Math.round(p.data.hours * 60) + p.data.minutes;
  const at = new Date(`${p.data.date}T12:00:00+05:30`);
  const age = Date.now() - at.getTime();
  if (total < 1 || total > 600) return { ok: false, message: "A single entry must be between 1 minute and 10 hours." };
  if (Number.isNaN(at.getTime()) || age < -86400000 || age > 60 * 86400000) return { ok: false, message: "The date must be within the last 60 days." };
  const ok = await addManualTime(p.data.taskId, total, p.data.note, at.toISOString(), v.id);
  revalidatePath("/ops", "layout");
  return { ok, message: ok ? `Added ${total} min.` : "Could not add that time." };
}

export async function addNoteAction(_prev: unknown, form: FormData) {
  const v = await staff();
  const p = z.object({ taskId: id, body: z.string().trim().min(1).max(2000) }).safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please write a note first." };
  const ok = await addNote(p.data.taskId, p.data.body, v.id);
  revalidatePath("/ops", "layout");
  return { ok, message: ok ? "Note saved." : "Could not save the note.", nonce: crypto.randomUUID() };
}

export async function escalateAction(taskId: string, contactId: string) {
  const v = await staff();
  if (!v || !id.safeParse(taskId).success || !id.safeParse(contactId).success) return { ok: false as const };
  const r = await escalate(taskId, contactId, v.id);
  revalidatePath("/ops", "layout");
  return r;
}

export async function checkDocumentAction(_prev: unknown, form: FormData) {
  const v = await staff();
  const p = z.object({ id, kind: z.enum(["policy", "discharge_summary", "bill", "id", "report"]) }).safeParse({ id: form.get("id"), kind: form.get("kind") });
  if (!v || !p.success) return { ok: false, message: "Please check the form." };
  const fields = [...form.entries()].filter(([k]) => k.startsWith("f:"));
  if (fields.length > 40 || fields.some(([k, val]) => k.length > 120 || typeof val !== "string" || val.length > 500)) return { ok: false, message: "Please check the form." };
  const values = Object.fromEntries(fields.map(([k, val]) => [k.slice(2), String(val)]));
  const ok = await saveCheck(p.data.id, values, p.data.kind, v.id);
  revalidatePath("/ops", "layout");
  revalidatePath("/family", "layout");
  return { ok, message: ok ? "Checked. Thank you." : "Could not save." };
}

export async function saveDraftAction(familyId: string, body: string) {
  const v = await staff();
  const p = z.object({ familyId: id, body: z.string().trim().min(1).max(2000) }).safeParse({ familyId, body });
  if (!v || !p.success) return { ok: false, reason: "Message is empty or too long." };
  const r = await saveDraft(p.data.familyId, p.data.body, v.id);
  revalidatePath("/ops", "layout");
  return r;
}

export async function sendDraftAction(messageId: string) {
  const v = await staff();
  if (!v || !id.safeParse(messageId).success) return { ok: false, reason: "Please sign in again." };
  const r = await approveAndSend(messageId, v.id);
  revalidatePath("/ops", "layout");
  return r;
}

export async function sendTemplateAction(familyId: string, name: string, params: string[]) {
  const v = await staff();
  const p = z.object({ familyId: id, name: z.enum(Object.keys(TEMPLATES) as [TemplateName, ...TemplateName[]]), params: z.array(z.string().trim().min(1).max(120)).max(5) }).safeParse({ familyId, name, params });
  if (!v || !p.success) return { ok: false, reason: "Please fill in every box." };
  const r = await sendTemplateMessage(p.data.familyId, p.data.name, p.data.params, v.id);
  revalidatePath("/ops", "layout");
  return r;
}

const onboard = z.object({
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().email().max(200),
  parentName: z.string().trim().min(2).max(120),
  phone: z.string().min(8).max(24),
  city: z.string().trim().min(2).max(80),
  language: z.enum(["Hindi", "Gujarati", "Marathi", "English"]),
  plan: z.coerce.number().refine((n) => (PLAN_PRICES as readonly number[]).includes(n)),
});

export async function staffOnboardAction(_prev: unknown, form: FormData) {
  const v = await staff();
  const p = onboard.safeParse(Object.fromEntries(form));
  if (!v) return { ok: false, message: "Please sign in again." };
  if (!p.success) return { ok: false, message: "Please fill in every field." };
  const phone = normalisePhone(p.data.phone);
  if (!phone) return { ok: false, message: "Please enter the WhatsApp number with its country code." };
  let ownerId: string;
  try {
    ownerId = await ensureOwner(p.data.ownerEmail, p.data.ownerName);
  } catch {
    return { ok: false, message: "That email belongs to a desk team member." };
  }
  const r = await createFamily({ ownerId, coordinatorId: v.role === "coordinator" ? v.id : undefined, parentName: p.data.parentName, phone, language: p.data.language, city: p.data.city, planUsd: p.data.plan, ownerPurposes: [], actorId: v.id });
  if (!r.ok) return { ok: false, message: r.reason };
  revalidatePath("/ops", "layout");
  redirect(`/ops/consent/${r.familyId}`);
}

export async function consentCallAction(_prev: unknown, form: FormData) {
  const v = await staff();
  const p = z.object({ parentId: id, familyId: id, notes: z.string().max(500).optional() }).safeParse({ parentId: form.get("parentId"), familyId: form.get("familyId"), notes: form.get("notes") ?? "" });
  if (!v || !p.success) return { ok: false, message: "Please sign in again." };
  const purposes = form.getAll("purpose").filter((x): x is Purpose => PURPOSES.includes(x as Purpose));
  const r = await confirmParentConsent(p.data.parentId, purposes, p.data.notes ?? "");
  revalidatePath("/ops", "layout");
  revalidatePath(`/family/${p.data.familyId}`, "layout");
  if (!r) return { ok: false, message: "That did not save." };
  return { ok: true, message: r === "granted" ? "Recorded. Consent is on file and the desk can start." : "Recorded. The desk cannot start until they agree to reading and keeping documents." };
}

export async function pauseCounselAction(familyId: string, parentId: string, reason: string) {
  const v = await staff();
  const p = z.object({ familyId: id, parentId: id, reason: z.string().trim().min(1).max(500) }).safeParse({ familyId, parentId, reason });
  if (!v || !p.success) return { ok: false };
  const ok = await pauseForCounsel(p.data.parentId, p.data.reason);
  revalidatePath("/ops", "layout");
  return { ok };
}

export async function requestApprovalAction(_prev: unknown, form: FormData) {
  const v = await staff();
  const p = z.object({ taskId: id, summary: z.string().trim().min(3).max(200), payee: z.string().trim().min(1).max(120), amount: z.coerce.number().int().min(0).max(100000000), fees: z.coerce.number().int().min(0).max(100000000), when: z.string().trim().min(1).max(80) }).safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please fill in every field." };
  if (looksLikeAdvice(p.data.summary)) return { ok: false, message: "This reads like advice. Route it to a licensed professional." };
  const ok = await requestApproval({ taskId: p.data.taskId, summary: p.data.summary, amountInr: p.data.amount, payee: p.data.payee, feesInr: p.data.fees, when: p.data.when, evidenceIds: [], userId: v.id });
  revalidatePath("/ops", "layout");
  revalidatePath("/family", "layout");
  return { ok, message: ok ? "Sent to the owner. Nothing happens until they say yes." : "That did not save." };
}

export async function addClaimAction(_prev: unknown, form: FormData) {
  const v = await staff();
  const p = z.object({ familyId: id, hospital: z.string().trim().min(2).max(160), kind: z.enum(["cashless", "reimbursement"]), amount: z.coerce.number().int().min(0).max(100000000), missing: z.string().max(1000) }).safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please fill in every field." };
  const ok = await addClaim(p.data.familyId, p.data.kind, p.data.hospital, p.data.amount, p.data.missing.split("\n").map((s) => s.trim()).filter(Boolean));
  revalidatePath("/family", "layout");
  return { ok, message: ok ? "Claim opened." : "That did not save." };
}

export async function toggleRequirementAction(reqId: string, received: boolean) {
  if (!(await staff()) || !id.safeParse(reqId).success) return { ok: false };
  const ok = await setRequirementReceived(reqId, received);
  revalidatePath("/family", "layout");
  return { ok };
}

export async function addRequirementAction(_prev: unknown, form: FormData) {
  const p = z.object({ claimId: id, label: z.string().trim().min(2).max(120) }).safeParse(Object.fromEntries(form));
  if (!(await staff()) || !p.success) return { message: "Please write what is missing." };
  await addRequirement(p.data.claimId, p.data.label);
  revalidatePath("/family", "layout");
  return { message: "" };
}

export async function setClaimStatusAction(claimId: string, status: string) {
  const p = z.object({ claimId: id, status: z.enum(["preparing", "submitted", "query", "approved", "settled"]) }).safeParse({ claimId, status });
  if (!(await staff()) || !p.success) return { ok: false };
  const ok = await setClaimStatus(p.data.claimId, p.data.status);
  revalidatePath("/family", "layout");
  return { ok };
}

export async function resolveAlertAction(alertId: string) {
  if (!(await staff()) || !id.safeParse(alertId).success) return { ok: false };
  const ok = await resolveAlert(alertId);
  revalidatePath("/ops", "layout");
  return { ok };
}

export async function newTaskAction(_prev: unknown, form: FormData) {
  const v = await staff();
  const p = z.object({ templateId: id, familyId: id, title: z.string().max(160).optional() }).safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please choose a family and a template." };
  const taskId = await createTaskFromTemplate(p.data.templateId, p.data.familyId, p.data.title, v.id);
  if (!taskId) return { ok: false, message: "Could not create the task for that family." };
  revalidatePath("/ops", "layout");
  redirect(`/ops/task/${taskId}`);
}
