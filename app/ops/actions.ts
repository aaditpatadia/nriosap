"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionViewer, isStaff } from "@/lib/auth";
import { addManualTime, addNote, createTaskFromTemplate, escalate, startTimer, stopTimer } from "@/lib/ops";
import { saveCheck } from "@/lib/vault";

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
  const r = await stopTimer(taskId, note.slice(0, 280), v.id);
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
  return { ok, message: ok ? "Note saved." : "Could not save the note." };
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
  const values = Object.fromEntries([...form.entries()].filter(([k]) => k.startsWith("f:")).map(([k, val]) => [k.slice(2), String(val)]));
  const ok = await saveCheck(p.data.id, values, p.data.kind, v.id);
  revalidatePath("/ops", "layout");
  revalidatePath("/family", "layout");
  return { ok, message: ok ? "Checked. Thank you." : "Could not save." };
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
