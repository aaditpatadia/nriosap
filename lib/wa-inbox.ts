import "server-only";
import { decryptField } from "./crypto";
import { asService, isUuid, one, rows, tx, type Tx } from "./db";
import { looksLikeAdvice } from "./rules";
import type { ServiceCategory } from "./request-engine";
import { CATEGORIES, isServiceCategory, type WaCategory } from "./wa-categorise";
import { deliver, isOptedOut, queueTemplate, queueText, type Recipient } from "./wa-outbox";
import { createRequestFromWhatsApp } from "./wa-pipeline";
import { asWaLang } from "./wa-templates";
import { insideServiceWindow } from "./whatsapp";

/**
 * What the desk sees and does in the WhatsApp inbox. Every read runs as the signed-in person, so RLS decides
 * which conversations appear. Every action is recorded, with who did it.
 */

type Row = Record<string, any>;

export interface ConversationRow {
  key: string; familyId: string | null; familyName: string | null; senderKind: string; senderName: string | null; tail: string | null;
  lastAt: string; lastText: string | null; lastType: string; category: string | null; confidence: number | null; status: string; open: number; emergency: boolean;
}

/** One row per number. A conversation's key is the start of the number's keyed hash, never the number. */
export async function conversations(filter: { status?: string } = {}): Promise<ConversationRow[]> {
  const r = await rows<Row>(
    `with last as (
       select distinct on (w.phone_hash) w.phone_hash, w.family_id, w.sender_kind, w.parent_id, w.profile_id, w.sender_contact_id, w.phone_tail,
              w.received_at, w.text, w.type, w.category, w.confidence, w.status
       from whatsapp_messages w where w.direction = 'in' order by w.phone_hash, w.received_at desc)
     select * from (
       select l.*, f.name as family_name, coalesce(p.name, pr.name, m.name) as sender_name,
              (select count(*)::int from whatsapp_messages x where x.phone_hash = l.phone_hash and x.direction = 'in' and x.status in ('needs_human','held_consent','rate_limited','waiting_plan')) as open,
              exists (select 1 from whatsapp_messages x where x.phone_hash = l.phone_hash and x.category = 'emergency' and x.status = 'needs_human') as emergency
       from last l left join families f on f.id = l.family_id left join parents p on p.id = l.parent_id
         left join profiles pr on pr.id = l.profile_id left join family_members m on m.id = l.sender_contact_id
     ) q order by q.emergency desc, (q.open > 0) desc, q.received_at desc limit 200`,
  );
  return r
    .map((x) => ({ key: String(x.phone_hash).slice(0, 32), familyId: x.family_id, familyName: x.family_name, senderKind: x.sender_kind, senderName: x.sender_name, tail: x.phone_tail, lastAt: x.received_at, lastText: x.text, lastType: x.type, category: x.category, confidence: x.confidence === null ? null : Number(x.confidence), status: x.status, open: x.open, emergency: x.emergency }))
    .filter((c) => !filter.status || (filter.status === "open" ? c.open > 0 : c.status === filter.status));
}

export interface ThreadMessage {
  id: string; direction: "in" | "out"; at: string; type: string; text: string | null; status: string; category: string | null; confidence: number | null; title: string | null;
  urgency: string | null; needsProfessional: boolean; facts: Record<string, unknown> | null; fieldConfidence: Record<string, number>; aiStatus: string; model: string | null; promptVersion: string | null;
  requestId: string | null; requestRef: string | null; documentId: string | null; hasVoice: boolean; transcript: string | null; mediaFilename: string | null; templateName: string | null;
  corrected: boolean | null; reviewedBy: string | null; copiedAt: string | null;
}

export interface Conversation {
  key: string; familyId: string | null; familyName: string | null; senderKind: string; senderName: string | null; tail: string | null; language: string | null;
  inWindow: boolean; stopped: boolean; messages: ThreadMessage[]; openRequests: { id: string; ref: string; title: string }[];
}

async function hashFor(key: string): Promise<string | null> {
  if (!/^[0-9a-f]{32}$/.test(key)) return null;
  const r = await one<Row>("select phone_hash from whatsapp_messages where left(phone_hash, 32) = $1 limit 1", [key]);
  return r?.phone_hash ?? null;
}

export async function conversation(key: string): Promise<Conversation | undefined> {
  const hash = await hashFor(key);
  if (!hash) return undefined;
  return tx(async (t) => {
    const msgs = await t.rows<Row>(
      `select w.*, r.ref as request_ref, u.name as reviewer from whatsapp_messages w left join service_requests r on r.id = w.request_id left join profiles u on u.id = w.category_confirmed_by
       where w.phone_hash = $1 order by w.received_at, w.created_at`,
      [hash],
    );
    if (!msgs.length) return undefined;
    const inbound = msgs.filter((m) => m.direction === "in");
    const last = inbound[inbound.length - 1] ?? msgs[msgs.length - 1];
    const who = await t.one<Row>("select coalesce(p.name, pr.name, m.name) as name, f.name as family_name from (select 1) x left join parents p on p.id = $1 left join profiles pr on pr.id = $2 left join family_members m on m.id = $3 left join families f on f.id = $4", [last.parent_id, last.profile_id, last.sender_contact_id, last.family_id]);
    const open = last.family_id ? await t.rows<Row>("select id, ref, title from service_requests where family_id = $1 and status not in ('completed','cancelled') order by updated_at desc limit 20", [last.family_id]) : [];
    // Reading the decrypted facts is a look at personal data, so it is written down.
    await t.run("select audit_event('view_whatsapp_conversation','whatsapp_message',$1,$2)", [last.id, last.family_id]);
    const stopped = await isOptedOut(t, hash);
    return {
      key, familyId: last.family_id, familyName: who?.family_name ?? null, senderKind: last.sender_kind, senderName: who?.name ?? null, tail: last.phone_tail, language: last.language,
      inWindow: insideServiceWindow(inbound.length ? inbound[inbound.length - 1].received_at : undefined, new Date()), stopped,
      openRequests: open.map((o) => ({ id: o.id, ref: o.ref, title: o.title })),
      messages: msgs.map((m) => ({
        id: m.id, direction: m.direction, at: m.direction === "in" ? m.received_at : m.created_at, type: m.type, text: m.text, status: m.status, category: m.category, confidence: m.confidence === null ? null : Number(m.confidence),
        title: m.direction === "in" ? m.title : null, urgency: m.urgency, needsProfessional: m.needs_professional, facts: m.facts_enc && m.family_id ? JSON.parse(decryptField(m.family_id, m.facts_enc)) : null,
        fieldConfidence: m.field_confidence ?? {}, aiStatus: m.ai_status, model: m.model_name, promptVersion: m.prompt_version, requestId: m.request_id, requestRef: m.request_ref, documentId: m.document_id,
        hasVoice: !!m.media_path, transcript: m.transcript, mediaFilename: m.media_filename, templateName: m.template_name, corrected: m.category_corrected, reviewedBy: m.reviewer, copiedAt: m.copied_at,
      })),
    };
  });
}

export type Result = { ok: true; note?: string } | { ok: false; reason: string };

/** The message, only when the signed-in person may work on it: an assigned coordinator, an admin, or any desk member for unknown numbers. */
async function workable(messageId: string): Promise<Row | undefined> {
  if (!isUuid(messageId)) return undefined;
  return one<Row>("select w.* from whatsapp_messages w where w.id = $1 and ((w.family_id is not null and public.can_work_family(w.family_id)) or (w.family_id is null and public.is_staff()))", [messageId]);
}

/** Records the first human touch and the action. `change` holds any fixed-text update for the action itself. */
async function touch(messageId: string, userId: string, action: string, change?: (t: Tx) => Promise<unknown>) {
  await asService(() =>
    tx(async (t) => {
      if (change) await change(t);
      const r = await t.one<Row>("update whatsapp_messages set first_human_at = coalesce(first_human_at, now()) where id = $1 returning family_id", [messageId]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,$2,'whatsapp_message',$3,$4)", [userId, action, messageId, r?.family_id ?? null]);
    }),
  );
}

/** Confirm the AI reading as it stands. Counts toward "categorised correctly" in Reports. */
export async function confirmCategory(messageId: string, userId: string): Promise<Result> {
  const m = await workable(messageId);
  if (!m || m.direction !== "in" || !m.category) return { ok: false, reason: "That message is not on your list." };
  await touch(messageId, userId, "whatsapp_category_confirmed", (t) => t.run("update whatsapp_messages set category_confirmed_by = $2, category_corrected = false, status = case when status in ('needs_human','routed') then 'confirmed' else status end where id = $1", [messageId, userId]));
  return { ok: true };
}

export async function changeCategory(messageId: string, category: string, userId: string): Promise<Result> {
  const m = await workable(messageId);
  if (!m || m.direction !== "in") return { ok: false, reason: "That message is not on your list." };
  if (!(CATEGORIES as readonly string[]).includes(category)) return { ok: false, reason: "Choose one of the categories." };
  await touch(messageId, userId, `whatsapp_category_changed:${category}`, (t) => t.run("update whatsapp_messages set category_corrected = (category is distinct from $3), category = $3, category_confirmed_by = $2, status = case when status in ('needs_human','routed') then 'confirmed' else status end where id = $1", [messageId, userId, category]));
  if (m.request_id && isServiceCategory(category)) await asService(() => tx((t) => t.run("update service_requests set category = $2, updated_at = now() where id = $1", [m.request_id, category])));
  return { ok: true };
}

/** A person makes the request. Desk-created requests skip the plan limit, as they do in the app. */
export async function createRequestFromMessage(messageId: string, category: string, userId: string, userName: string): Promise<Result & { ref?: string }> {
  const m = await workable(messageId);
  if (!m || m.direction !== "in" || !m.family_id) return { ok: false, reason: "Only a message from a known family can become a request." };
  if (m.request_id) return { ok: false, reason: "This message is already on a request." };
  if (!isServiceCategory(category)) return { ok: false, reason: "Choose one of the eight service areas." };
  const made = await asService(() =>
    tx(async (t) => {
      const r = await createRequestFromWhatsApp(t, {
        familyId: m.family_id, category: category as ServiceCategory, title: (m.title || m.text || "WhatsApp message").slice(0, 120), description: m.text || "Sent on WhatsApp. See the original in the WhatsApp inbox.",
        urgent: m.urgency === "high", needsProfessional: m.needs_professional, createdBy: userId, memberId: m.sender_contact_id, documentIds: m.document_id ? [m.document_id] : [], checkNote: null, actorName: userName,
      });
      await t.run("update whatsapp_messages set request_id = $2, category = $3, category_corrected = (category is distinct from $3), category_confirmed_by = $4, status = 'confirmed' where id = $1", [messageId, r.id, category, userId]);
      return r;
    }),
  );
  await touch(messageId, userId, "whatsapp_request_created");
  return { ok: true, ref: made.ref };
}

export async function mergeIntoRequest(messageId: string, requestId: string, userId: string, userName: string): Promise<Result> {
  const m = await workable(messageId);
  if (!m || m.direction !== "in" || !m.family_id || !isUuid(requestId)) return { ok: false, reason: "That message is not on your list." };
  const ok = await asService(() =>
    tx(async (t) => {
      const r = await t.one<Row>("select id, ref from service_requests where id = $1 and family_id = $2", [requestId, m.family_id]);
      if (!r) return false;
      await t.run("insert into request_events(request_id, family_id, kind, body, actor_id, actor_name, customer_visible) values ($1,$2,'message',$3,$4,$5,true)", [r.id, m.family_id, `On WhatsApp: ${m.text || "A file or voice note, kept with the request."}`.slice(0, 4000), userId, userName]);
      if (m.document_id) await t.run("insert into request_attachments(request_id, family_id, document_id, kind, caption) values ($1,$2,$3,'customer','Sent on WhatsApp') on conflict do nothing", [r.id, m.family_id, m.document_id]);
      await t.run("update whatsapp_messages set request_id = $2, status = 'confirmed' where id = $1", [messageId, r.id]);
      return true;
    }),
  );
  if (!ok) return { ok: false, reason: "That request is not in this family." };
  await touch(messageId, userId, "whatsapp_merged");
  return { ok: true };
}

export async function markSpam(messageId: string, userId: string): Promise<Result> {
  const m = await workable(messageId);
  if (!m || m.direction !== "in") return { ok: false, reason: "That message is not on your list." };
  await touch(messageId, userId, "whatsapp_spam", (t) => t.run("update whatsapp_messages set status = 'spam' where id = $1", [messageId]));
  return { ok: true };
}

/**
 * A desk reply. Blocked if it reads like advice. With sending off it waits in the outbox as "would send".
 * Outside 24 hours only the approved "reply waiting" template can go, and the text waits for their answer.
 */
export async function replyToConversation(key: string, body: string, userId: string, userName: string): Promise<Result> {
  const hash = await hashFor(key);
  const text = body.trim().slice(0, 1000);
  if (!hash || !text) return { ok: false, reason: "Write a reply first." };
  if (looksLikeAdvice(text)) return { ok: false, reason: "This reads like medical, legal or tax advice. Route it to a licensed professional." };
  const last = await one<Row>(
    "select w.* from whatsapp_messages w where w.phone_hash = $1 and w.direction = 'in' and ((w.family_id is not null and public.can_work_family(w.family_id)) or (w.family_id is null and public.is_staff())) order by w.received_at desc limit 1",
    [hash],
  );
  if (!last) return { ok: false, reason: "That conversation is not on your list." };
  const to: Recipient = { familyId: last.family_id, phoneHash: hash, phoneEnc: last.phone_enc, phoneTail: last.phone_tail, language: asWaLang(last.language) };
  const inWindow = insideServiceWindow(last.received_at, new Date());
  const ids = await asService(() =>
    tx(async (t) => {
      if (await isOptedOut(t, hash)) return null;
      const out = [await queueText(t, to, text, { requestId: last.request_id, draftedBy: userId, kind: "desk_reply" })];
      if (!inWindow) {
        const tid = await queueTemplate(t, to, "ally_reply_waiting", ["ji", userName.split(" ")[0] || "Your coordinator"], { requestId: last.request_id, draftedBy: userId });
        if (tid) out.unshift(tid);
      }
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'whatsapp_reply_queued','whatsapp_message',$2,$3)", [userId, last.id, last.family_id]);
      return out;
    }),
  );
  if (!ids) return { ok: false, reason: "This number sent STOP. Nothing can be sent until they agree again." };
  await touch(last.id, userId, "whatsapp_replied");
  for (const id of ids) await deliver(id);
  return { ok: true, note: inWindow ? undefined : "Outside 24 hours: the approved template goes first, and your text waits until they reply." };
}

/** The desk copies a would-send reply to send by hand. Recorded, so the outbox shows it was handled. */
export async function markCopied(messageId: string, userId: string): Promise<Result> {
  const m = await workable(messageId);
  if (!m || m.direction !== "out") return { ok: false, reason: "Not found." };
  await asService(() =>
    tx(async (t) => {
      await t.run("update whatsapp_messages set copied_at = now() where id = $1", [messageId]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'whatsapp_reply_copied','whatsapp_message',$2,$3)", [userId, messageId, m.family_id]);
    }),
  );
  return { ok: true };
}

export interface OutboxRow { id: string; key: string; at: string; text: string; status: string; familyName: string | null; tail: string | null; templateName: string | null; copiedAt: string | null; kind: string | null }

export async function outbox(): Promise<OutboxRow[]> {
  const r = await rows<Row>(
    `select w.id, w.phone_hash, w.created_at, w.text, w.status, w.phone_tail, w.template_name, w.copied_at, w.title, f.name as family_name
     from whatsapp_messages w left join families f on f.id = w.family_id
     where w.direction = 'out' and w.status in ('would_send','blocked','failed','queued') order by w.created_at desc limit 200`,
  );
  return r.map((x) => ({ id: x.id, key: String(x.phone_hash).slice(0, 32), at: x.created_at, text: x.text ?? "", status: x.status, familyName: x.family_name, tail: x.phone_tail, templateName: x.template_name, copiedAt: x.copied_at, kind: x.title }));
}

/** The numbers for Reports. Counts, never content. */
export async function whatsappMetrics(days = 30) {
  const r = await one<Row>(
    `select count(*) filter (where direction = 'in')::int as received,
            count(*) filter (where direction = 'in' and model_name is not null)::int as ai_read,
            count(*) filter (where direction = 'in' and model_name is not null and category_corrected = false)::int as confirmed_unchanged,
            count(*) filter (where direction = 'in' and model_name is not null and category_corrected = true)::int as corrected,
            percentile_cont(0.5) within group (order by extract(epoch from (first_human_at - received_at))) filter (where direction = 'in' and first_human_at is not null) as median_seconds
     from whatsapp_messages where received_at > now() - make_interval(days => $1)`,
    [days],
  );
  return { received: r?.received ?? 0, aiRead: r?.ai_read ?? 0, confirmedUnchanged: r?.confirmed_unchanged ?? 0, corrected: r?.corrected ?? 0, medianMinutesToHuman: r?.median_seconds == null ? null : Math.round(Number(r.median_seconds) / 60) };
}

export const CATEGORY_OPTIONS = CATEGORIES as readonly WaCategory[];

export async function mediaFor(messageId: string): Promise<{ path: string; familyId: string; mime: string } | undefined> {
  if (!isUuid(messageId)) return undefined;
  const r = await one<Row>("select media_path, family_id, media_mime from whatsapp_messages where id = $1 and family_id is not null and public.can_work_family(family_id)", [messageId]);
  return r?.media_path ? { path: r.media_path, familyId: r.family_id, mime: r.media_mime ?? "audio/ogg" } : undefined;
}

/** For the owner app: the WhatsApp messages behind one request. RLS limits this to the family. */
export async function whatsappForRequest(requestId: string): Promise<{ id: string; at: string; text: string | null; type: string; documentId: string | null; hasVoice: boolean }[]> {
  if (!isUuid(requestId)) return [];
  const r = await rows<Row>("select id, received_at, text, type, document_id, media_path from whatsapp_messages where request_id = $1 and direction = 'in' order by received_at", [requestId]);
  return r.map((m) => ({ id: m.id, at: m.received_at, text: m.text, type: m.type, documentId: m.document_id, hasVoice: !!m.media_path }));
}


/** For the owner's settings page: whether their WhatsApp number is linked, so quote approvals by WhatsApp count. */
export async function whatsappLinkedAt(profileId: string): Promise<string | null> {
  if (!isUuid(profileId)) return null;
  return (await one<Row>("select whatsapp_verified_at from profiles where id = $1", [profileId]))?.whatsapp_verified_at ?? null;
}
