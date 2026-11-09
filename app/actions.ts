"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionViewer, isDemoMode, isStaff } from "@/lib/auth";
import { asService, tx } from "@/lib/db";
import {
  addTime,
  addWaitlist,
  decideApproval,
  getFamily,
  receiveParentMessage,
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
  const r = await receiveParentMessage(fam.parent.phone, p.data.text);
  revalidatePath(`/family/${fam.id}`, "layout");
  revalidatePath("/ops", "layout");
  return { ok: r.matched, emergency: r.matched ? r.emergency : false };
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
  const v = await actionViewer();
  if (!v) return { ok: false as const, message: "Please sign in first." };
  await asService(() =>
    tx(async (t) => {
      const f = await t.one<{ id: string }>("insert into families(owner_id, name, plan_usd, status) values ($1,$2,79,'onboarding') returning id", [v.id, `${p.data.parentName.split(" ").at(-1)} family`]);
      const parent = await t.one<{ id: string }>("insert into parents(family_id, name, phone, language) values ($1,$2,$3,$4) returning id", [f!.id, p.data.parentName, p.data.phone, p.data.language]);
      for (const purpose of ["read_records", "store", "act_on_named_task"]) await t.run("insert into consents(parent_id, purpose, evidence_ref) values ($1,$2,'onboarding form')", [parent!.id, purpose]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'onboarding_consent_recorded','family',$2,$3)", [v.id, f!.id, f!.id]);
    }),
  );
  return { ok: true as const, message: `Thanks. A coordinator will call ${p.data.parentName} in ${p.data.language} to confirm consent in their own words before anything starts.` };
}

export async function coordinatorSends(familyId: string, body: string) {
  const p = z.object({ familyId: z.string().uuid(), body: z.string().min(1).max(1000) }).safeParse({ familyId, body });
  const v = await actionViewer();
  if (!p.success || !isStaff(v)) return { ok: false as const, reason: "Message is empty or too long." };
  const r = await sendCoordinatorMessage(p.data.familyId, p.data.body, v!.id);
  revalidatePath("/ops", "layout");
  return r;
}
