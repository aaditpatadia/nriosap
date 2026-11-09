import "server-only";
import { isUuid, one, rows, tx } from "./db";
import { looksLikeAdvice } from "./rules";
import { LANGUAGE_CODE } from "./transcribe";
import type { Language } from "./types";
import { sendTemplate, sendText } from "./wa-client";
import { insideServiceWindow } from "./whatsapp";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Names must match templates approved in the WhatsApp Business account. */
export const TEMPLATES = {
  doc_reminder: { label: "Document reminder", preview: "Namaste {name}. Please send your {doc} on WhatsApp when you can. Your desk.", params: ["name", "doc"] },
  task_update: { label: "Task update", preview: "Namaste {name}. Update from your desk: {update}.", params: ["name", "update"] },
} as const;
export type TemplateName = keyof typeof TEMPLATES;

export interface OutboundRow { id: string; direction: "in" | "out"; body: string; at: string; status: string; msgType: string; transcript: string | null; transcriptStatus: string | null; documentId: string | null; hasVoice: boolean; templateName: string | null }

export async function thread(familyId: string): Promise<OutboundRow[]> {
  if (!isUuid(familyId)) return [];
  const r = await rows<Row>("select * from messages where family_id = $1 order by created_at", [familyId]);
  return r.map((x) => ({ id: x.id, direction: x.direction, body: x.body ?? "", at: x.created_at, status: x.status, msgType: x.msg_type, transcript: x.transcript, transcriptStatus: x.transcript_status, documentId: x.document_id, hasVoice: !!x.media_ref, templateName: x.template_name }));
}

const BLOCKED = "This reads like medical, legal or tax advice. Route it to a licensed professional.";

/** A draft that trips the advice filter is kept as blocked, so it can be reviewed but never sent. */
export async function saveDraft(familyId: string, body: string, userId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isUuid(familyId)) return { ok: false, reason: "Family not found" };
  const blocked = looksLikeAdvice(body);
  return tx(async (t) => {
    const fam = await t.one<Row>("select p.id, p.language from families f join parents p on p.family_id = f.id where f.id = $1 and public.can_work_family(f.id) limit 1", [familyId]);
    if (!fam) return { ok: false, reason: "Family not found" };
    await t.run("insert into messages(family_id, parent_id, direction, body, language, status, drafted_by) values ($1,$2,'out',$3,$4,$5,$6)", [familyId, fam.id, body.slice(0, 2000), fam.language, blocked ? "blocked" : "draft", userId]);
    await t.run("select audit_event($1,'family',$2,$3)", [blocked ? "message_blocked_advice" : "message_drafted", familyId, familyId]);
    return blocked ? { ok: false, reason: BLOCKED } : { ok: true };
  });
}

export type SendOutcome = { ok: boolean; status?: "sent" | "approved_not_sent" | "failed"; reason?: string };

/** The human click. Checks the advice filter again and the 24 hour window, then sends if sending is switched on. */
export async function approveAndSend(messageId: string, userId: string): Promise<SendOutcome> {
  if (!isUuid(messageId)) return { ok: false, reason: "Not found" };
  const m = await one<Row>(
    `select m.*, p.phone, (select max(x.created_at) from messages x where x.family_id = m.family_id and x.direction = 'in') as last_in
     from messages m join parents p on p.id = m.parent_id where m.id = $1 and m.direction = 'out' and public.can_work_family(m.family_id)`,
    [messageId],
  );
  if (!m) return { ok: false, reason: "Not found" };
  if (m.status !== "draft") return { ok: false, reason: "Only a saved draft can be sent." };
  if (looksLikeAdvice(m.body ?? "")) return { ok: false, reason: BLOCKED };
  if (!insideServiceWindow(m.last_in ?? undefined, new Date())) return { ok: false, reason: "It has been more than 24 hours since they wrote. Use a template message." };
  const r = await sendText(m.phone, m.body);
  return record(messageId, m.family_id, userId, r);
}

export async function sendTemplateMessage(familyId: string, name: TemplateName, params: string[], userId: string): Promise<SendOutcome> {
  if (!isUuid(familyId)) return { ok: false, reason: "Not found" };
  const fam = await one<Row>("select p.id, p.phone, p.language from families f join parents p on p.family_id = f.id where f.id = $1 and public.can_work_family(f.id) limit 1", [familyId]);
  if (!fam) return { ok: false, reason: "Not found" };
  const def = TEMPLATES[name];
  const body = def.params.reduce<string>((s, p, i) => s.replace(`{${p}}`, params[i] ?? ""), def.preview);
  if (looksLikeAdvice(body)) return { ok: false, reason: BLOCKED };
  const row = await one<Row>("insert into messages(family_id, parent_id, direction, body, language, status, msg_type, template_name, drafted_by) values ($1,$2,'out',$3,$4,'draft','template',$5,$6) returning id", [familyId, fam.id, body, fam.language, name, userId]);
  const r = await sendTemplate(fam.phone, name, LANGUAGE_CODE[fam.language as Language].split("-")[0], params);
  return record(row!.id, familyId, userId, r);
}

async function record(messageId: string, familyId: string, userId: string, r: Awaited<ReturnType<typeof sendText>>): Promise<SendOutcome> {
  const status = r.status === "sent" ? "sent" : r.status === "disabled" ? "approved_not_sent" : "failed";
  await tx(async (t) => {
    await t.run("update messages set status = $2, approved_by = $3, approved_at = now(), wa_id = $4 where id = $1", [messageId, status, userId, r.status === "sent" ? r.waId : null]);
    await t.run("select audit_event($1,'family',$2,$3)", [`message_${status}`, familyId, familyId]);
  });
  if (r.status === "failed") return { ok: false, status, reason: "WhatsApp did not accept this. Please try again." };
  return { ok: true, status };
}

/** A short-lived link to a voice note for staff working this family. */
export async function voiceNotePath(messageId: string): Promise<{ path: string; familyId: string } | undefined> {
  if (!isUuid(messageId)) return undefined;
  const r = await one<Row>("select media_ref, family_id from messages where id = $1 and public.can_work_family(family_id)", [messageId]);
  return r?.media_ref ? { path: r.media_ref, familyId: r.family_id } : undefined;
}
