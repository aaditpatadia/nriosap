"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { answerQuestion, type AssistantAnswer } from "@/lib/assistant";
import { askClaude, assistantAiConfigured } from "@/lib/assistant-ai";
import { actionViewer } from "@/lib/auth";
import { asService, tx } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { familyAccess } from "@/lib/service-requests";
import { addDeadline, assistantConsent, assistantFacts, setAssistantConsent, setDeadlineStatus, setDocumentDetails, setPropertyContact, updateProperty } from "@/lib/workspace";
import { DEADLINE_KINDS, isIsoDate, RECURRENCES, REMINDER_CHOICES, type DeadlineKind, type Recurrence } from "@/lib/workspace-rules";

const id = z.string().uuid();
const optionalId = z.union([id, z.literal("")]);
const optionalDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/);
type Msg = { ok: boolean; message: string } | null;
const refresh = (familyId: string) => revalidatePath(`/family/${familyId}`, "layout");

export async function addDeadlineAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  if (!v) return { ok: false, message: "Please sign in again." };
  const p = z.object({
    familyId: id,
    title: z.string().trim().min(2, "Please give it a name.").max(160),
    kind: z.enum(Object.keys(DEADLINE_KINDS) as [DeadlineKind, ...DeadlineKind[]]),
    amount: z.union([z.literal(""), z.coerce.number().int("Whole rupees only.").min(0).max(100000000)]),
    dueOn: z.string().refine(isIsoDate, "Please choose a date."),
    propertyId: optionalId,
    person: z.string().trim().max(120),
    recurrence: z.enum(Object.keys(RECURRENCES) as [Recurrence, ...Recurrence[]]),
    documentId: optionalId,
    reminderOn: optionalDate,
    notes: z.string().trim().max(500),
  }).safeParse({ familyId: form.get("familyId"), title: form.get("title"), kind: form.get("kind"), amount: form.get("amount") ?? "", dueOn: form.get("dueOn"), propertyId: form.get("propertyId") ?? "", person: form.get("person") ?? "", recurrence: form.get("recurrence"), documentId: form.get("documentId") ?? "", reminderOn: form.get("reminderOn") ?? "", notes: form.get("notes") ?? "" });
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Please check the form." };
  const reminderDays = form.getAll("reminder").map(Number).filter((n) => (REMINDER_CHOICES as readonly number[]).includes(n));
  const ok = await addDeadline(p.data.familyId, { title: p.data.title, kind: p.data.kind, amountInr: p.data.amount === "" ? null : p.data.amount, dueOn: p.data.dueOn, propertyId: p.data.propertyId || null, person: p.data.person || null, recurrence: p.data.recurrence, documentId: p.data.documentId || null, reminderDays, reminderOn: p.data.reminderOn || null, notes: p.data.notes || null }, v.id);
  refresh(p.data.familyId);
  return { ok, message: ok ? "Added to your calendar." : "You do not have permission to add this." };
}

export async function deadlineStatusAction(deadlineId: string, status: "handled" | "cancelled" | "upcoming") {
  const v = await actionViewer();
  if (!v || !id.safeParse(deadlineId).success || !["handled", "cancelled", "upcoming"].includes(status)) return { ok: false };
  const fam = await setDeadlineStatus(deadlineId, status, v.id);
  if (fam) refresh(fam);
  return { ok: !!fam };
}

export async function documentDetailsAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  const p = z.object({ documentId: id, expiresOn: optionalDate, issuedOn: optionalDate, tags: z.string().trim().max(200), propertyId: optionalId }).safeParse({ documentId: form.get("documentId"), expiresOn: form.get("expiresOn") ?? "", issuedOn: form.get("issuedOn") ?? "", tags: form.get("tags") ?? "", propertyId: form.get("propertyId") ?? "" });
  if (!v || !p.success) return { ok: false, message: "Please check the dates." };
  const fam = await setDocumentDetails(p.data.documentId, { expiresOn: p.data.expiresOn || null, issuedOn: p.data.issuedOn || null, tags: p.data.tags.split(",").map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 10), propertyId: p.data.propertyId || null }, v.id);
  if (fam) refresh(fam);
  return { ok: !!fam, message: fam ? "Saved." : "You do not have permission to change this." };
}

export async function updatePropertyAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await actionViewer();
  const p = z.object({ propertyId: id, ownership: z.string().trim().max(200), rent: z.union([z.literal(""), z.coerce.number().int().min(0).max(100000000)]), tenantName: z.string().trim().max(120), tenantPhone: z.string().trim().max(24), leaseEnd: optionalDate, notes: z.string().trim().max(1000) }).safeParse(Object.fromEntries(form));
  if (!v || !p.success) return { ok: false, message: "Please check the form." };
  const fam = await updateProperty(p.data.propertyId, { ownership: p.data.ownership, rentInr: p.data.rent === "" ? null : p.data.rent, tenantName: p.data.tenantName, tenantPhone: p.data.tenantPhone, leaseEnd: p.data.leaseEnd || null, notes: p.data.notes }, v.id);
  if (fam) refresh(fam);
  return { ok: !!fam, message: fam ? "Saved." : "You do not have permission to change this." };
}

export async function propertyContactAction(propertyId: string, memberId: string, linked: boolean) {
  const v = await actionViewer();
  if (!v || !id.safeParse(propertyId).success || !id.safeParse(memberId).success) return { ok: false };
  const fam = await setPropertyContact(propertyId, memberId, linked, v.id);
  if (fam) refresh(fam);
  return { ok: !!fam };
}

export type AskResult = AssistantAnswer & { viaAi?: boolean };

/** Reads and prepares only. There is no path from here to a payment, a filing or an approval. */
export async function askAllyAction(familyId: string, question: string): Promise<AskResult> {
  const nothing: AskResult = { kind: "none", text: "Please sign in again.", sources: [] };
  const v = await actionViewer();
  const p = z.object({ familyId: id, question: z.string().trim().min(2).max(500) }).safeParse({ familyId, question });
  if (!v || !p.success) return nothing;
  const access = await familyAccess(p.data.familyId);
  if (!access.owner && !access.staff && !access.member) return nothing;
  if (!(await rateLimit(`assistant:${v.id}`, 60, 3600))) return { kind: "none", text: "That is a lot of questions. Please wait a little.", sources: [] };
  const facts = await assistantFacts(p.data.familyId, access);
  let answer: AskResult = answerQuestion(p.data.question, facts);
  if (answer.kind === "none" && assistantAiConfigured() && (await assistantConsent(v.id))) {
    const text = await askClaude(p.data.question, facts);
    if (text) answer = { kind: "answer", text, sources: [], viaAi: true };
  }
  // The question itself is not stored or logged.
  await asService(() => tx((t) => t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'assistant_query','family',$2,$3)", [v.id, p.data.familyId, p.data.familyId])));
  return answer;
}

export async function assistantConsentAction(on: boolean) {
  const v = await actionViewer();
  if (!v) return { ok: false };
  await setAssistantConsent(v.id, on);
  revalidatePath("/family", "layout");
  return { ok: true };
}
