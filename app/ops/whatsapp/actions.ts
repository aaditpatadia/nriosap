"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionViewer, isStaff } from "@/lib/auth";
import { changeCategory, confirmCategory, createRequestFromMessage, markCopied, markSpam, mergeIntoRequest, replyToConversation, type Result } from "@/lib/wa-inbox";

const id = z.string().uuid();
const key = z.string().regex(/^[0-9a-f]{32}$/);

async function staff() {
  const v = await actionViewer();
  return isStaff(v) ? v! : null;
}

const done = (r: Result) => {
  revalidatePath("/ops/whatsapp", "layout");
  return r;
};
const NO: Result = { ok: false, reason: "Please sign in again." };

export async function confirmCategoryAction(messageId: string): Promise<Result> {
  const v = await staff();
  if (!v || !id.safeParse(messageId).success) return NO;
  return done(await confirmCategory(messageId, v.id));
}

export async function changeCategoryAction(messageId: string, category: string): Promise<Result> {
  const v = await staff();
  if (!v || !id.safeParse(messageId).success) return NO;
  return done(await changeCategory(messageId, String(category).slice(0, 60), v.id));
}

export async function createRequestAction(messageId: string, category: string): Promise<Result> {
  const v = await staff();
  if (!v || !id.safeParse(messageId).success) return NO;
  const r = await createRequestFromMessage(messageId, String(category).slice(0, 60), v.id, v.name);
  return done(r.ok ? { ok: true, note: `Request ${r.ref} created.` } : r);
}

export async function mergeAction(messageId: string, requestId: string): Promise<Result> {
  const v = await staff();
  if (!v || !id.safeParse(messageId).success || !id.safeParse(requestId).success) return NO;
  return done(await mergeIntoRequest(messageId, requestId, v.id, v.name));
}

export async function spamAction(messageId: string): Promise<Result> {
  const v = await staff();
  if (!v || !id.safeParse(messageId).success) return NO;
  return done(await markSpam(messageId, v.id));
}

export async function replyAction(conversationKey: string, body: string): Promise<Result> {
  const v = await staff();
  if (!v || !key.safeParse(conversationKey).success) return NO;
  return done(await replyToConversation(conversationKey, String(body ?? ""), v.id, v.name));
}

export async function copiedAction(messageId: string): Promise<Result> {
  const v = await staff();
  if (!v || !id.safeParse(messageId).success) return NO;
  return done(await markCopied(messageId, v.id));
}
