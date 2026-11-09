"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addTime,
  addWaitlist,
  decideApproval,
  receiveParentMessage,
  sendCoordinatorMessage,
  setTaskStatus,
  undoApproval,
  logAudit,
} from "@/lib/store";

const OWNER = "demo-owner"; // demo auth: see README

export async function decideAction(id: string, status: "approved" | "declined") {
  const parsed = z.object({ id: z.string().min(1), status: z.enum(["approved", "declined"]) }).safeParse({ id, status });
  if (!parsed.success) return { ok: false as const };
  const a = decideApproval(parsed.data.id, parsed.data.status, OWNER);
  if (!a) return { ok: false as const };
  revalidatePath(`/family/${a.familyId}`, "layout");
  return { ok: true as const, undoUntil: a.undoUntil! };
}

export async function undoAction(id: string) {
  const a = undoApproval(z.string().min(1).parse(id), OWNER);
  if (!a) return { ok: false as const };
  revalidatePath(`/family/${a.familyId}`, "layout");
  return { ok: true as const };
}

export async function logTimeAction(taskId: string, minutes: number, note: string) {
  const p = z.object({ taskId: z.string(), minutes: z.number().min(1).max(600), note: z.string().max(280) }).safeParse({ taskId, minutes, note });
  if (!p.success) return { ok: false as const };
  const e = addTime(p.data.taskId, p.data.minutes, p.data.note, "coordinator-demo");
  revalidatePath("/ops", "layout");
  return { ok: !!e };
}

export async function setStatusAction(taskId: string, status: "todo" | "doing" | "waiting_parent" | "waiting_owner" | "done") {
  setTaskStatus(taskId, status, "coordinator-demo");
  revalidatePath("/ops", "layout");
  return { ok: true as const };
}

export async function joinWaitlist(_prev: unknown, form: FormData) {
  const p = z
    .object({ email: z.string().email().max(200), country: z.string().max(80), note: z.string().max(400).optional() })
    .safeParse({ email: form.get("email"), country: form.get("country"), note: form.get("note") ?? "" });
  if (!p.success) return { ok: false as const, message: "Please enter a valid email and country." };
  addWaitlist({ email: p.data.email, country: p.data.country, note: p.data.note ?? "" });
  return { ok: true as const, message: "You are on the list. A person from the desk will write to you within two days." };
}

export async function parentSays(familyId: string, phone: string, text: string) {
  const p = z.object({ phone: z.string().min(5), text: z.string().min(1).max(1000) }).safeParse({ phone, text });
  if (!p.success) return { ok: false as const };
  const r = receiveParentMessage(p.data.phone, p.data.text);
  revalidatePath(`/family/${familyId}`, "layout");
  revalidatePath("/ops", "layout");
  return { ok: r.matched, emergency: r.matched ? r.emergency : false };
}

export async function coordinatorSends(familyId: string, body: string) {
  const p = z.object({ familyId: z.string(), body: z.string().min(1).max(1000) }).safeParse({ familyId, body });
  if (!p.success) return { ok: false as const, reason: "Message is empty or too long." };
  const r = sendCoordinatorMessage(p.data.familyId, p.data.body, "coordinator-demo");
  revalidatePath("/ops", "layout");
  return r;
}

export async function recordOnboarding(_prev: unknown, form: FormData) {
  const p = z
    .object({
      parentName: z.string().min(2).max(120),
      phone: z.string().min(8).max(20),
      language: z.enum(["Hindi", "Gujarati", "Marathi", "English"]),
      consentRead: z.literal("on"),
      consentAct: z.literal("on"),
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false as const, message: "Please fill in every field and tick both consent boxes." };
  logAudit(OWNER, "onboarding_consent_recorded", "family", "new");
  return { ok: true as const, message: `Thanks. A coordinator will call ${p.data.parentName} in ${p.data.language} to confirm consent in her own words before anything starts.` };
}
