"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionViewer, isDemoMode, isStaff } from "@/lib/auth";
import { normalisePhone, PLAN_PRICES, REQUIRED_PURPOSES } from "@/lib/consent";
import { confirmOwnerConsent, createFamily } from "@/lib/onboarding";
import { PURPOSES, type Purpose } from "@/lib/upload-rules";
import { storeInbound } from "@/lib/wa-inbound";
import {
  addTime,
  addWaitlist,
  decideApproval,
  getFamily,
  sendCoordinatorMessage,
  setTaskStatus,
  undoApproval,
} from "@/lib/store";

export async function decideAction(id: string, status: "approved" | "declined") {
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(["approved", "declined"]) }).safeParse({ id, status });
  if (!parsed.success || !(await actionViewer())) return { ok: false as const };
  const a = await decideApproval(parsed.data.id, parsed.data.status);
  if (!a) return { ok: false as const };
  revalidatePath(`/family/${a.familyId}`, "layout");
  return { ok: true as const, undoUntil: a.undoUntil! };
}

export async function undoAction(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success || !(await actionViewer())) return { ok: false as const };
  const a = await undoApproval(parsed.data);
  if (!a) return { ok: false as const };
  revalidatePath(`/family/${a.familyId}`, "layout");
  return { ok: true as const };
}

export async function logTimeAction(taskId: string, minutes: number, note: string) {
  const p = z.object({ taskId: z.string().uuid(), minutes: z.number().min(1).max(600), note: z.string().max(280) }).safeParse({ taskId, minutes, note });
  const v = await actionViewer();
  if (!p.success || !isStaff(v)) return { ok: false as const };
  const e = await addTime(p.data.taskId, p.data.minutes, p.data.note, v!.id);
  revalidatePath("/ops", "layout");
  return { ok: !!e };
}

export async function setStatusAction(taskId: string, status: "todo" | "doing" | "waiting_parent" | "waiting_owner" | "done") {
  const p = z.object({ taskId: z.string().uuid(), status: z.enum(["todo", "doing", "waiting_parent", "waiting_owner", "done"]) }).safeParse({ taskId, status });
  const v = await actionViewer();
  if (!p.success || !isStaff(v)) return { ok: false as const };
  await setTaskStatus(p.data.taskId, p.data.status, v!.id);
  revalidatePath("/ops", "layout");
  return { ok: true as const };
}

export async function joinWaitlist(_prev: unknown, form: FormData) {
  const p = z
    .object({ email: z.string().email().max(200), country: z.string().max(80), note: z.string().max(400).optional() })
    .safeParse({ email: form.get("email"), country: form.get("country"), note: form.get("note") ?? "" });
  if (!p.success) return { ok: false as const, message: "Please enter a valid email and country." };
  await addWaitlist({ email: p.data.email, country: p.data.country, note: p.data.note ?? "" });
  return { ok: true as const, message: "You are on the list. A person from the desk will write to you within two days." };
}

/** Simulated parent message for demos. The phone comes from the family the viewer can see, never from the client. */
export async function parentSays(familyId: string, text: string) {
  const p = z.object({ familyId: z.string().uuid(), text: z.string().min(1).max(1000) }).safeParse({ familyId, text });
  if (!p.success || !isDemoMode() || !(await actionViewer())) return { ok: false as const };
  const fam = await getFamily(p.data.familyId);
  if (!fam) return { ok: false as const };
  const r = await storeInbound({ from: fam.parent.phone, id: "simulated", type: "text", text: p.data.text }, false);
  revalidatePath(`/family/${fam.id}`, "layout");
  revalidatePath("/ops", "layout");
  return { ok: r.matched, emergency: r.matched ? r.emergency : false };
}

const onboardingBase = z.object({
  parentName: z.string().trim().min(2).max(120),
  phone: z.string().min(8).max(24),
  language: z.enum(["Hindi", "Gujarati", "Marathi", "English"]),
  city: z.string().trim().min(2).max(80),
  plan: z.coerce.number().refine((n) => (PLAN_PRICES as readonly number[]).includes(n)),
});

/** The owner signs up themselves and gives their own consent here. */
export async function recordOnboarding(_prev: unknown, form: FormData) {
  const p = onboardingBase.safeParse(Object.fromEntries(form));
  const v = await actionViewer();
  if (!v) return { ok: false as const, message: "Please sign in first." };
  if (!p.success) return { ok: false as const, message: "Please fill in every field." };
  const phone = normalisePhone(p.data.phone);
  if (!phone) return { ok: false as const, message: "Please enter the WhatsApp number with its country code, like +91 98000 00000." };
  const purposes = form.getAll("purpose").filter((x): x is Purpose => PURPOSES.includes(x as Purpose));
  if (!REQUIRED_PURPOSES.every((r) => purposes.includes(r))) return { ok: false as const, message: "We cannot start without consent to read and keep documents." };
  const r = await createFamily({ ownerId: v.id, parentName: p.data.parentName, phone, language: p.data.language, city: p.data.city, planUsd: p.data.plan, ownerPurposes: [...new Set(purposes)], actorId: v.id });
  if (!r.ok) return { ok: false as const, message: r.reason };
  redirect(`/family/${r.familyId}`);
}

/** The owner confirms their own consent when the desk started the onboarding for them. */
export async function ownerConsentAction(_prev: unknown, form: FormData) {
  const fid = z.string().uuid().safeParse(form.get("familyId"));
  const purposes = form.getAll("purpose").filter((x): x is Purpose => PURPOSES.includes(x as Purpose));
  if (!fid.success || !(await actionViewer())) return { ok: false, message: "Please sign in again." };
  if (!REQUIRED_PURPOSES.every((r) => purposes.includes(r))) return { ok: false, message: "We cannot start without consent to read and keep documents." };
  const ok = await confirmOwnerConsent(fid.data, purposes);
  revalidatePath(`/family/${fid.data}`, "layout");
  return { ok, message: ok ? "Thank you. Your consent is recorded." : "That did not save." };
}

export async function coordinatorSends(familyId: string, body: string) {
  const p = z.object({ familyId: z.string().uuid(), body: z.string().min(1).max(1000) }).safeParse({ familyId, body });
  const v = await actionViewer();
  if (!p.success || !isStaff(v)) return { ok: false as const, reason: "Message is empty or too long." };
  const r = await sendCoordinatorMessage(p.data.familyId, p.data.body, v!.id);
  revalidatePath("/ops", "layout");
  return r;
}
