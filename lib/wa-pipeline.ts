import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { encryptField } from "./crypto";
import { asService, tx, withContext, type Tx } from "./db";
import { log } from "./log";
import { loadPlans } from "./plans";
import { planForPrice, requestLimitReason, type Plan } from "./plan-rules";
import { withdrawByParentMessage } from "./privacy";
import { hitCount } from "./ratelimit";
import { requestTitle, understandRequest, type ServiceCategory } from "./request-engine";
import { monthStartIst } from "./rules";
import { supabaseAdmin } from "./supabase";
import { getTranscriber } from "./transcribe";
import { MAX_WHATSAPP_MEDIA_BYTES, sniffAudio, type Purpose } from "./upload-rules";
import { BUCKET, ingestDocument } from "./vault";
import { fetchMedia } from "./wa-client";
import { CategoriseError, decide, getCategoriser, isServiceCategory, type Decision, type Reading, type WaCategory } from "./wa-categorise";
import { detectEmergency } from "./wa-emergency";
import { readCommand, type Command } from "./wa-keywords";
import { deliverAll, isOptedOut, queueReply, queueTemplate, type Recipient } from "./wa-outbox";
import { mediaAllowed, parseWebhook, type WaStatus } from "./wa-parse";
import { decryptPhone, e164FromWa, encryptPhone, phoneHash, phoneTail } from "./wa-phone";
import { identifySender, type Sender } from "./wa-sender";
import { CONSENT_WORDING_VERSION, type ReplyKind, type WaLang } from "./wa-templates";

/**
 * The WhatsApp inbound pipeline.
 *
 * ingest() runs inside the webhook: it stores each message once (the wamid is unique) and records delivery
 * receipts. processMessage() runs in a background job: it identifies the sender, honours STOP and consent,
 * checks for an emergency, reads the message, and turns it into a request or a task for a person.
 *
 * Nothing here pays, signs, files or approves. The one exception to "a person decides" is an owner's own
 * APPROVE or UNDO reply from their linked number, which goes through the same database functions as the
 * Approve button in the app, with the same 5 minute undo. No AI output is ever read as a command.
 */

type Row = Record<string, any>;

export const LIMITS = {
  perNumberPerMinute: () => Number(process.env.WHATSAPP_LIMIT_PER_NUMBER ?? 20),
  globalPerMinute: () => Number(process.env.WHATSAPP_LIMIT_GLOBAL ?? 600),
};

// ---------- Webhook side ----------

export interface IngestResult { stored: string[]; duplicates: number; statuses: number; skipped: number }

export async function ingest(payload: unknown): Promise<IngestResult> {
  const { messages, statuses } = parseWebhook(payload);
  const out: IngestResult = { stored: [], duplicates: 0, statuses: 0, skipped: 0 };
  for (const m of messages) {
    const e164 = e164FromWa(m.from);
    if (!e164) {
      out.skipped++;
      continue;
    }
    const hash = phoneHash(e164);
    let limited = false;
    try {
      limited = (await hitCount(`wa:num:${hash.slice(0, 40)}`, 60)) > LIMITS.perNumberPerMinute();
    } catch {
      limited = false;
    }
    const row = await asService(() =>
      tx((t) =>
        t.one<Row>(
          `insert into whatsapp_messages(phone_hash, phone_enc, phone_tail, direction, wamid, reply_to_wamid, type, text, media_id, media_mime, media_filename, received_at, status)
           values ($1,$2,$3,'in',$4,$5,$6,$7,$8,$9,$10, coalesce(to_timestamp($11::bigint), now()), $12)
           on conflict (wamid) do nothing returning id`,
          [hash, encryptPhone(e164), phoneTail(e164), m.wamid, m.replyTo, m.type, m.text, m.mediaId, m.mime, m.filename, m.timestamp && /^\d{1,12}$/.test(m.timestamp) ? m.timestamp : null, limited ? "rate_limited" : "received"],
        ),
      ),
    );
    if (!row) out.duplicates++;
    else if (!limited) out.stored.push(row.id);
  }
  for (const s of statuses) out.statuses += await recordStatus(s);
  return out;
}

const STATUS_ORDER = ["queued", "would_send", "sent", "delivered", "read"];

/** A delivery receipt. Stored once, and only ever moves a message forward. */
export async function recordStatus(s: WaStatus): Promise<number> {
  return asService(() =>
    tx(async (t) => {
      const n = await t.run("insert into whatsapp_status_events(wamid, status, error_code) values ($1,$2,$3) on conflict (wamid, status) do nothing", [s.wamid, s.status, s.errorCode]);
      if (!n) return 0;
      await t.run(
        `update whatsapp_messages set status = $2, error_code = coalesce($3, error_code)
         where wamid = $1 and direction = 'out' and ($2 = 'failed' or coalesce(array_position($4::text[], status), 0) < array_position($4::text[], $2))`,
        [s.wamid, s.status, s.errorCode, STATUS_ORDER],
      );
      return 1;
    }),
  );
}

// ---------- Background side ----------

const first = (n: string | null | undefined) => (n ? n.trim().split(/\s+/)[0] : undefined);

/** Script first, then the person's saved language. Romanised Gujarati or Marathi falls back to the profile. */
export function guessLanguage(text: string | null | undefined, fallback: WaLang): WaLang {
  if (!text) return fallback;
  if (/[઀-૿]/.test(text)) return "Gujarati";
  if (/[ऀ-ॿ]/.test(text)) return /(आहे|नाही|आम्ही|तुम्ही|करा|झाले|आहेत|आई|बाबा)/.test(text) ? "Marathi" : fallback === "Marathi" ? "Marathi" : "Hindi";
  return fallback;
}

type After = { kind: "withdraw_parent"; parentId: string } | { kind: "requeue"; hash: string } | { kind: "decide"; profileId: string; approvalId: string; ref: string; verb: "approve" | "decline" | "undo"; to: Recipient; vars: Vars };
type Vars = { name?: string; coordinator?: string; ref?: string };

interface Ctx { t: Tx; m: Row; s: Sender; to: Recipient; vars: Vars; replies: string[]; after: After[] }

const setStatus = (c: Ctx, status: string, extra = "") => c.t.run(`update whatsapp_messages set status = $2${extra} where id = $1`, [c.m.id, status]);
const reply = async (c: Ctx, kind: ReplyKind, extra: Vars = {}) => void c.replies.push(await queueReply(c.t, c.to, kind, { ...c.vars, ...extra }));

async function recentlySent(t: Tx, hash: string, kind: ReplyKind) {
  return !!(await t.one<Row>("select 1 as x from whatsapp_messages where phone_hash = $1 and direction = 'out' and title = $2 and created_at > now() - interval '24 hours' limit 1", [hash, kind]));
}

async function addTask(c: Ctx, title: string, opts: { minutes?: number; kind?: string; checklist?: string[]; documentId?: string | null } = {}): Promise<string | null> {
  if (!c.s.familyId) return null;
  const r = await c.t.one<Row>(
    `insert into tasks(family_id, kind, title, status, owner_id, due_at, sla_at, hour_budget, needs_approval, checklist, source, document_id)
     values ($1,$2,$3,'todo',$4, now() + make_interval(mins => $5), now() + make_interval(mins => $5), 0.3, false, $6, 'whatsapp', $7) returning id`,
    [c.s.familyId, opts.kind ?? "errand", title.slice(0, 200), c.s.coordinatorId, opts.minutes ?? 240, opts.checklist ?? ["Read the original message in the WhatsApp inbox", "Reply to the person, or call them"], opts.documentId ?? null],
  );
  await c.t.run("update whatsapp_messages set task_id = coalesce(task_id, $2) where id = $1", [c.m.id, r!.id]);
  return r!.id;
}

async function raiseEmergency(c: Ctx) {
  const who = c.s.name ?? `a number ending ${c.m.phone_tail}`;
  await c.t.run("update whatsapp_messages set category = 'emergency', urgency = 'high', ai_status = 'skipped_rules', status = 'needs_human' where id = $1", [c.m.id]);
  if (c.s.familyId) {
    // The queue puts anything starting with EMERGENCY at the very top.
    const r = await c.t.one<Row>(
      `insert into tasks(family_id, kind, title, status, owner_id, due_at, sla_at, hour_budget, needs_approval, checklist, source)
       values ($1,'errand',$2,'todo',$3, now(), now() + interval '10 minutes', 1, false, $4, 'whatsapp') returning id`,
      [c.s.familyId, `EMERGENCY: call ${who} now (WhatsApp)`.slice(0, 200), c.s.coordinatorId, ["Call the person now", "If anyone is in danger, make sure 112 has been called", "Tell the family owner", "Do not give medical advice"]],
    );
    await c.t.run("update whatsapp_messages set task_id = $2 where id = $1", [c.m.id, r!.id]);
    await c.t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'message','system','Desk',$2)", [c.s.familyId, `A WhatsApp message from ${who} looks like an emergency. ${c.vars.coordinator} has been alerted.`]);
  } else {
    await c.t.run("insert into alerts(family_id, kind, dedupe_key, body) values (null,'whatsapp',$1,$2) on conflict (dedupe_key) do nothing", [`wa-emergency:${c.m.id}`, `EMERGENCY words in WhatsApp from an unknown number ending ${c.m.phone_tail}. Open the WhatsApp inbox now.`]);
  }
  await reply(c, c.s.familyId ? "emergency" : "emergency_unknown");
}

async function stop(c: Ctx) {
  const hash = c.m.phone_hash;
  await c.t.run("insert into whatsapp_optouts(phone_hash, stopped_at, stop_wamid) values ($1, now(), $2) on conflict (phone_hash) do update set stopped_at = now(), stop_wamid = excluded.stop_wamid, restarted_at = null", [hash, c.m.wamid]);
  await c.t.run("update whatsapp_consents set withdrawn_at = now() where phone_hash = $1 and withdrawn_at is null", [hash]);
  await c.t.run("update whatsapp_messages set status = 'stopped' where phone_hash = $1 and direction = 'in' and status in ('received','held_consent') and id <> $2", [hash, c.m.id]);
  await c.t.run("update whatsapp_messages set status = 'blocked' where phone_hash = $1 and direction = 'out' and status = 'queued'", [hash]);
  await c.t.run("insert into audit_log(action, entity, entity_id, family_id) values ('whatsapp_stop','whatsapp_message',$1,$2)", [c.m.id, c.s.familyId]);
  if (c.s.familyId) {
    await c.t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'system','system','Desk',$2)", [c.s.familyId, `${c.s.name ?? "Someone"} sent STOP on WhatsApp. Ally has stopped messaging that number and stopped work on their messages.`]);
    if (c.s.kind === "parent" && c.s.parentId) c.after.push({ kind: "withdraw_parent", parentId: c.s.parentId });
    else await addTask(c, `STOP on WhatsApp from ${c.s.name ?? "a family contact"}: stop work on their messages and confirm with the family`, { minutes: 240, kind: "checkin" });
  }
  await setStatus(c, "stopped");
  await reply(c, "stopped");
}

async function grantConsent(c: Ctx, personOnly: boolean) {
  const purposes = personOnly ? ["handle"] : ["handle", "ai_read"];
  for (const p of purposes) {
    await c.t.run(
      `insert into whatsapp_consents(phone_hash, family_id, purpose, granted_at, wording_version, language, evidence_wamid) values ($1,$2,$3,now(),$4,$5,$6)
       on conflict (phone_hash, purpose) do update set granted_at = now(), withdrawn_at = null, family_id = excluded.family_id, wording_version = excluded.wording_version, language = excluded.language, evidence_wamid = excluded.evidence_wamid`,
      [c.m.phone_hash, c.s.familyId, p, CONSENT_WORDING_VERSION, c.to.language, c.m.wamid],
    );
  }
  if (personOnly) await c.t.run("update whatsapp_consents set withdrawn_at = now() where phone_hash = $1 and purpose = 'ai_read' and withdrawn_at is null", [c.m.phone_hash]);
  await c.t.run("update whatsapp_optouts set restarted_at = now() where phone_hash = $1", [c.m.phone_hash]);
  await c.t.run("insert into audit_log(action, entity, entity_id, family_id) values ($1,'whatsapp_message',$2,$3)", [`whatsapp_consent_granted:${purposes.join(",")}`, c.m.id, c.s.familyId]);
  await setStatus(c, "command");
  await reply(c, personOnly ? "consent_person_only" : "consent_thanks");
  c.after.push({ kind: "requeue", hash: c.m.phone_hash });
}

async function promptConsent(c: Ctx) {
  await setStatus(c, "held_consent");
  await c.t.run("update whatsapp_optouts set consent_prompted_at = now() where phone_hash = $1", [c.m.phone_hash]);
  if (!(await recentlySent(c.t, c.m.phone_hash, "consent_prompt"))) await reply(c, "consent_prompt");
}

const LINK_TTL_MINUTES = 15;
const codeHash = (code: string) => createHmac("sha256", process.env.APP_ENCRYPTION_KEY ?? "dev-only-insecure-master-key-change-me").update(`wa-link:${code}`).digest("hex");

/** For the owner's settings page. The code proves the owner controls the number it is sent from. */
export async function createLinkCode(profileId: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await asService(() =>
    tx(async (t) => {
      await t.run("delete from whatsapp_link_codes where profile_id = $1 or expires_at < now()", [profileId]);
      await t.run("insert into whatsapp_link_codes(code_hash, profile_id, expires_at) values ($1,$2, now() + make_interval(mins => $3))", [codeHash(code), profileId, LINK_TTL_MINUTES]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id) values ($1,'whatsapp_link_code_created','profile',$1)", [profileId]);
    }),
  );
  return code;
}

async function link(c: Ctx, code: string, e164: string): Promise<boolean> {
  const r = await c.t.one<Row>("update whatsapp_link_codes set used_at = now() where code_hash = $1 and used_at is null and expires_at > now() returning profile_id", [codeHash(code)]);
  if (!r) return false;
  await c.t.run("update profiles set whatsapp_hash = null, whatsapp_verified_at = null, whatsapp_phone_enc = null where whatsapp_hash = $1 and id <> $2", [c.m.phone_hash, r.profile_id]);
  await c.t.run("update profiles set whatsapp_hash = $2, whatsapp_verified_at = now(), whatsapp_phone_enc = $3 where id = $1", [r.profile_id, c.m.phone_hash, encryptPhone(e164)]);
  await c.t.run("insert into audit_log(actor_id, action, entity, entity_id) values ($1,'whatsapp_linked','profile',$1)", [r.profile_id]);
  return true;
}

async function quoteDecision(c: Ctx, cmd: Extract<Command, { ref: string }>) {
  await setStatus(c, "command");
  if (c.s.kind !== "owner" || !c.s.verifiedOwner || !c.s.profileId || !c.s.familyId) return reply(c, "approval_not_owner");
  const q = await c.t.one<Row>("select q.approval_id from quotations q join service_requests r on r.id = q.request_id where r.ref = $1 and r.family_id = $2 and q.approval_id is not null order by q.created_at desc limit 1", [cmd.ref, c.s.familyId]);
  if (!q) return reply(c, "approval_failed", { ref: cmd.ref });
  c.after.push({ kind: "decide", profileId: c.s.profileId, approvalId: q.approval_id, ref: cmd.ref, verb: cmd.kind, to: c.to, vars: { ...c.vars, ref: cmd.ref } });
}

/** Phase A: everything that needs no slow call. Returns true when the message is fully handled. */
async function handleFast(c: Ctx, cmd: Command, e164: string): Promise<boolean> {
  const { t, m, s } = c;
  await t.run(
    "update whatsapp_messages set family_id = $2, sender_kind = $3, parent_id = $4, profile_id = $5, sender_contact_id = $6, language = $7 where id = $1",
    [m.id, s.familyId, s.kind, s.parentId, s.profileId, s.contactId, c.to.language],
  );
  if (cmd.kind === "stop") {
    await stop(c);
    return true;
  }
  if (cmd.kind === "link") {
    const ok = await link(c, cmd.code, e164);
    await setStatus(c, "command");
    await reply(c, ok ? "linked" : "link_failed");
    return true;
  }
  if (detectEmergency(m.text)) {
    await raiseEmergency(c);
    return true;
  }
  if (s.kind === "unknown" || !s.familyId) {
    await setStatus(c, "needs_human");
    const day = new Date().toISOString().slice(0, 10);
    await t.run("insert into alerts(family_id, kind, dedupe_key, body) values (null,'whatsapp',$1,$2) on conflict (dedupe_key) do nothing", [`wa-unknown:${m.phone_hash.slice(0, 24)}:${day}`, `WhatsApp from an unknown number ending ${m.phone_tail}. Ask who they are before sharing anything.`]);
    if (!(await recentlySent(t, m.phone_hash, "unknown"))) await reply(c, "unknown");
    return true;
  }
  const stopped = await isOptedOut(t, m.phone_hash);
  if (s.consentByCallOnly && (!s.consent.handle || stopped)) {
    // A parent's consent is taken on a call in their own language, never by a WhatsApp reply.
    await setStatus(c, "held_consent");
    if (!(await t.one<Row>("select 1 as x from tasks where family_id = $1 and source = 'whatsapp' and status <> 'done' and title like 'Consent call needed%'", [s.familyId]))) {
      await addTask(c, `Consent call needed: ${s.name ?? "the parent"} wrote on WhatsApp before consent was confirmed`, { kind: "checkin", checklist: ["Call in their language and read the consent script", "Record consent on the consent page", "Then open the held WhatsApp messages"] });
    }
    if (!(await recentlySent(t, m.phone_hash, "human"))) await reply(c, "human");
    return true;
  }
  if (stopped || !s.consent.handle) {
    if (cmd.kind === "consent_yes" || cmd.kind === "consent_person_only") {
    await grantConsent(c, cmd.kind === "consent_person_only");
    return true;
  }
    if (cmd.kind === "consent_no" && !stopped) {
      await setStatus(c, "command");
      await reply(c, "consent_declined");
      return true;
    }
    await promptConsent(c);
    return true;
  }
  if (cmd.kind === "human") {
    await setStatus(c, "command");
    await addTask(c, `Call back: ${s.name ?? "a family contact"} asked for a person on WhatsApp`, { minutes: 60, kind: "checkin" });
    await reply(c, "human");
    return true;
  }
  if (cmd.kind === "approve" || cmd.kind === "decline" || cmd.kind === "undo") {
    await quoteDecision(c, cmd);
    return true;
  }
  if (m.type === "other" || !mediaAllowed(m.type, m.media_mime)) {
    await setStatus(c, "rejected");
    await reply(c, "unsupported_media");
    return true;
  }
  if (m.type === "text" && !m.text?.trim()) {
    await setStatus(c, "needs_human");
    return true;
  }
  return false;
}

const DOC_CATEGORY: Record<string, ServiceCategory | undefined> = { bill: "Bills and Renewals", policy: "Insurance Administration", discharge_summary: "Insurance Administration", id: "Documents and Government Paperwork" };

interface Slow { reading: Reading | null; aiStatus: string; documentId: string | null; docKind: string | null; docConfidence: number; docNeedsCheck: boolean; mediaPath: string | null; mediaBytes: number | null; transcript: string | null; failure: null | { status: "rejected" | "needs_human"; reply: ReplyKind | null; task: string | null } }

/** Phase B: media download and the AI reading. No transaction is held while these run. */
async function slowWork(m: Row, s: Sender): Promise<Slow> {
  const out: Slow = { reading: null, aiStatus: "not_run", documentId: null, docKind: null, docConfidence: 0, docNeedsCheck: false, mediaPath: null, mediaBytes: null, transcript: null, failure: null };
  const who = s.name ?? "a family contact";
  if (m.media_id) {
    const f = await fetchMedia(m.media_id, MAX_WHATSAPP_MEDIA_BYTES);
    if (!f.ok) {
      out.failure = f.reason === "too_big" ? { status: "rejected", reply: "too_big", task: null } : { status: "needs_human", reply: null, task: `Ask ${who} to send their file again. We could not fetch it from WhatsApp.` };
      return out;
    }
    out.mediaBytes = f.bytes.byteLength;
    if (m.type === "audio") {
      const a = sniffAudio(f.bytes);
      if (!a) {
        out.failure = { status: "rejected", reply: "unsupported_media", task: null };
        return out;
      }
      const path = `${s.familyId}/wa-voice/${m.id}.${a.ext}`;
      const up = await supabaseAdmin().storage.from(BUCKET).upload(path, Buffer.from(f.bytes), { contentType: a.mime, upsert: true });
      if (up.error) {
        out.failure = { status: "needs_human", reply: null, task: `A voice note from ${who} could not be stored. Ask them to send it again.` };
        return out;
      }
      out.mediaPath = path;
      out.aiStatus = "skipped_voice";
      // Voice notes are for a person to hear. Transcription only with the family's own opt-in, and it is not an AI reading.
      const fam = await asService(() => tx((t) => t.one<Row>("select whatsapp_transcribe from families where id = $1", [s.familyId])));
      if (fam?.whatsapp_transcribe && process.env.SARVAM_API_KEY) {
        const r = await getTranscriber().transcribe({ bytes: f.bytes, mime: a.mime, language: s.language });
        if (r.status === "done") out.transcript = r.text;
      }
    } else {
      const purposes: Purpose[] = s.consent.ai ? ["store", "read_records"] : ["store"];
      const r = await ingestDocument({ familyId: s.familyId!, filename: m.media_filename ?? "WhatsApp file", bytes: f.bytes, maxBytes: MAX_WHATSAPP_MEDIA_BYTES, purposes, uploaderId: s.profileId, source: "whatsapp" });
      if (!r.ok) {
        out.failure = r.status === 415 ? { status: "rejected", reply: "unsupported_media", task: null } : r.status === 413 ? { status: "rejected", reply: "too_big", task: null } : { status: "needs_human", reply: null, task: `A file from ${who} on WhatsApp was not stored: ${r.reason}` };
        return out;
      }
      out.documentId = r.documentId;
      out.docNeedsCheck = r.needsCheck;
      out.docConfidence = r.confidence;
      const d = await asService(() => tx((t) => t.one<Row>("select kind, extraction_status from documents where id = $1", [r.documentId])));
      out.docKind = d?.extraction_status === "done" ? d.kind : null;
      out.aiStatus = s.consent.ai ? (d?.extraction_status === "done" ? "done" : "failed") : "skipped_consent";
    }
  }
  const text = m.text?.trim();
  if (text) {
    if (!s.consent.ai) out.aiStatus = "skipped_consent";
    else {
      try {
        out.reading = await getCategoriser().categorise(text);
        out.aiStatus = "done";
      } catch (e) {
        out.aiStatus = e instanceof CategoriseError && e.message === "refusal" ? "refused" : "failed";
        log("warn", "whatsapp_categorise_failed", { messageId: m.id, error: (e as Error).constructor.name });
      }
    }
  }
  return out;
}

function decisionFor(m: Row, slow: Slow): Decision {
  const text = m.text?.trim() ?? "";
  if (text) {
    const d = decide(text, slow.reading);
    if (slow.documentId && slow.docNeedsCheck) d.needsHuman = true;
    if (!slow.reading && slow.docKind && DOC_CATEGORY[slow.docKind] && !d.emergency && !d.refused) return { ...d, category: DOC_CATEGORY[slow.docKind]! };
    return d;
  }
  if (slow.transcript && detectEmergency(slow.transcript)) return { category: "emergency", needsHuman: true, lowFields: [], emergency: true, refused: null, needsProfessional: false };
  const cat = slow.docKind ? DOC_CATEGORY[slow.docKind] : undefined;
  const low = slow.docConfidence < 0.9;
  return { category: cat ?? "unclear", needsHuman: !cat || low || slow.docNeedsCheck || !slow.documentId, lowFields: low ? ["document"] : [], emergency: false, refused: null, needsProfessional: false };
}

async function findOpenRequest(t: Tx, m: Row, familyId: string, category: WaCategory): Promise<Row | undefined> {
  if (m.reply_to_wamid) {
    const r = await t.one<Row>(
      "select r.id, r.ref, r.task_id from whatsapp_messages w join service_requests r on r.id = w.request_id where w.wamid = $1 and w.family_id = $2 and r.status not in ('completed','cancelled')",
      [m.reply_to_wamid, familyId],
    );
    if (r) return r;
  }
  return t.one<Row>(
    `select r.id, r.ref, r.task_id from whatsapp_messages w join service_requests r on r.id = w.request_id
     where w.phone_hash = $1 and w.family_id = $2 and w.id <> $3 and w.received_at > now() - interval '72 hours'
       and r.status not in ('completed','cancelled') and ($4 = 'unclear' or r.category = $4)
     order by w.received_at desc limit 1`,
    [m.phone_hash, familyId, m.id, category],
  );
}

export interface NewRequest { familyId: string; category: ServiceCategory; title: string; description: string; urgent: boolean; needsProfessional: boolean; createdBy: string | null; memberId: string | null; documentIds: string[]; checkNote: string | null; actorName: string }

/** Same rows as a request made in the app, marked as coming from WhatsApp. Callers check the plan limit first. */
export async function createRequestFromWhatsApp(t: Tx, n: NewRequest): Promise<{ id: string; ref: string; taskId: string }> {
  const f = await t.one<Row>("select coordinator_id from families where id = $1", [n.familyId]);
  const checklist = ["Read the original WhatsApp message", "Confirm exactly what is needed", "Say plainly if this cannot be done", "Send a quotation before any cost or filing"];
  if (n.checkNote) checklist.unshift(n.checkNote);
  if (n.needsProfessional) checklist.unshift("This needs a licensed professional. Do not advise. Send it to one.");
  const task = await t.one<Row>(
    `insert into tasks(family_id, kind, title, status, owner_id, due_at, sla_at, hour_budget, needs_approval, checklist, source)
     values ($1,'errand',$2,'todo',$3, now() + interval '1 day', now() + interval '1 day', 1, false, $4, 'whatsapp') returning id`,
    [n.familyId, `${n.checkNote ? "Check: " : ""}${n.category}: ${n.title}`.slice(0, 200), f?.coordinator_id ?? null, checklist],
  );
  const seen = understandRequest(n.description);
  const r = await t.one<Row>(
    `insert into service_requests(family_id, created_by, category, title, description, location, priority, coordinator_id, task_id, understanding, needs_professional, member_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id, ref`,
    [n.familyId, n.createdBy, n.category, n.title.slice(0, 200), n.description.slice(0, 4000), seen.location, n.urgent ? "urgent" : "normal", f?.coordinator_id ?? null, task!.id, JSON.stringify({ ...seen, via: "whatsapp" }), n.needsProfessional, n.memberId],
  );
  await t.run("insert into request_events(request_id, family_id, kind, status, body, actor_id, actor_name) values ($1,$2,'status','submitted','Request received on WhatsApp.',$3,$4)", [r!.id, n.familyId, n.createdBy, n.actorName]);
  for (const d of n.documentIds) await t.run("insert into request_attachments(request_id, family_id, document_id, kind, caption) select $1,$2,d.id,'customer','Sent on WhatsApp' from documents d where d.id = $3 and d.family_id = $2 on conflict do nothing", [r!.id, n.familyId, d]);
  await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'system','human',$2,$3)", [n.familyId, n.actorName, `New request ${r!.ref} via WhatsApp: ${n.title}`]);
  await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'request_created_whatsapp','service_request',$2,$3)", [n.createdBy, r!.id, n.familyId]);
  return { id: r!.id, ref: r!.ref, taskId: task!.id };
}

/** Lite and any other capped plan. Desk-created requests skip this, as they do in the app. */
export async function planLimit(t: Tx, familyId: string, plans: Plan[]): Promise<{ reason: string; planName: string } | null> {
  const used = await t.one<Row>("select f.plan_usd, (select count(*)::int from service_requests r where r.family_id = f.id and r.created_at >= $2) as used from families f where f.id = $1", [familyId, monthStartIst(new Date())]);
  if (!used) return null;
  const plan = planForPrice(Number(used.plan_usd), plans);
  const reason = requestLimitReason(plan, used.used);
  return reason ? { reason, planName: plan.name } : null;
}

function describe(m: Row, slow: Slow): string {
  const t = m.text?.trim();
  if (t) return t;
  if (m.type === "audio") return "Voice note sent on WhatsApp. Listen to it in the WhatsApp inbox.";
  return `${m.type === "image" ? "Photo" : "Document"} sent on WhatsApp${slow.documentId ? ", saved to the vault" : ""}.`;
}

/** Phase C: record the reading and route the message. */
async function route(c: Ctx, slow: Slow, plans: Plan[]) {
  const { t, m, s } = c;
  const familyId = s.familyId!;
  await t.run("update whatsapp_messages set document_id = $2, media_path = $3, media_bytes = $4, transcript = $5, ai_status = $6 where id = $1", [m.id, slow.documentId, slow.mediaPath, slow.mediaBytes, slow.transcript, slow.aiStatus]);
  if (slow.failure) {
    await setStatus(c, slow.failure.status);
    if (slow.failure.task) await addTask(c, slow.failure.task);
    if (slow.failure.reply) await reply(c, slow.failure.reply);
    return;
  }
  const d = decisionFor(m, slow);
  const r = slow.reading;
  const conf = r ? Math.min(...Object.values(r.confidence)) : slow.documentId ? slow.docConfidence : null;
  const title = (r?.title ?? (m.text ? requestTitle(m.text) : describe(m, slow))).slice(0, 120);
  await t.run(
    `update whatsapp_messages set category = $2, confidence = $3, title = $4, urgency = $5, needs_professional = $6, facts_enc = $7, field_confidence = $8, model_name = $9, prompt_version = $10 where id = $1`,
    [m.id, d.category, conf === null ? null : Math.round(conf * 100) / 100, title, r?.urgency ?? null, d.needsProfessional, r ? encryptField(familyId, JSON.stringify(r.facts)) : null, JSON.stringify(r?.confidence ?? {}), r?.model ?? null, r?.promptVersion ?? null],
  );
  if (d.emergency) return raiseEmergency(c);
  if (d.refused) {
    await setStatus(c, "needs_human");
    await addTask(c, `Refused on WhatsApp: ${title}. Explain to ${s.name ?? "them"} why we cannot do this. Do not act on it.`, { checklist: ["Read the message", "Explain plainly that we only use lawful routes", "Do not give advice"] });
    await reply(c, "refused");
    return;
  }
  const checkNote = d.lowFields.length ? `AI reading under 90% (${d.lowFields.join(", ")}). Check the category and facts before relying on them.` : !r && m.text ? "No AI reading. Read the message and set the category." : null;
  const open = await findOpenRequest(t, m, familyId, d.category);
  if (open) {
    await t.run("insert into request_events(request_id, family_id, kind, body, actor_id, actor_name) values ($1,$2,'message',$3,$4,$5)", [open.id, familyId, `On WhatsApp: ${describe(m, slow)}`.slice(0, 4000), s.profileId, s.name ?? "Family contact"]);
    if (slow.documentId) await t.run("insert into request_attachments(request_id, family_id, document_id, kind, caption) values ($1,$2,$3,'customer','Sent on WhatsApp') on conflict do nothing", [open.id, familyId, slow.documentId]);
    await t.run("update service_requests set updated_at = now(), status = case when status in ('awaiting_information','awaiting_customer') then 'under_review' else status end where id = $1", [open.id]);
    await t.run("update whatsapp_messages set request_id = $2 where id = $1", [m.id, open.id]);
    if (d.needsHuman) await addTask(c, `Check WhatsApp message on ${open.ref}: ${title}`, { checklist: [checkNote ?? "Read the message and the AI reading", "Confirm or change the category in the WhatsApp inbox"] });
    await setStatus(c, d.needsHuman ? "needs_human" : "routed");
    await reply(c, d.needsProfessional ? "professional" : "request_continued", { ref: open.ref });
    return;
  }
  if (!isServiceCategory(d.category)) {
    await setStatus(c, "needs_human");
    await addTask(c, `Read and sort a WhatsApp message from ${s.name ?? "a family contact"}`, { checklist: ["Open it in the WhatsApp inbox", "Set the category", "Create a request or reply"] });
    await reply(c, d.needsProfessional ? "professional" : "received");
    return;
  }
  const limit = await planLimit(t, familyId, plans);
  if (limit) {
    await setStatus(c, "waiting_plan");
    await addTask(c, `Waiting for plan: ${title}`, { checklist: ["The family's monthly request limit is used", "The owner has been told", "Create the request when the owner changes plan, or next month"] });
    await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'system','system','Desk',$2)", [familyId, `A WhatsApp request is waiting: ${title}. ${limit.reason}`]);
    await reply(c, "waiting_plan");
    if (s.kind !== "owner") {
      const o = await t.one<Row>("select p.name, p.whatsapp_hash, p.whatsapp_phone_enc, p.preferred_language from families f join profiles p on p.id = f.owner_id where f.id = $1 and p.whatsapp_verified_at is not null", [familyId]);
      if (o?.whatsapp_phone_enc) {
        const id = await queueTemplate(t, { familyId, phoneHash: o.whatsapp_hash, phoneEnc: o.whatsapp_phone_enc, phoneTail: null, language: guessLanguage(null, (o.preferred_language as WaLang) ?? "English") }, "ally_plan_limit", [first(o.name) ?? "ji", limit.planName]);
        if (id) c.replies.push(id);
      }
    }
    return;
  }
  const made = await createRequestFromWhatsApp(t, {
    familyId, category: d.category, title, description: describe(m, slow), urgent: r?.urgency === "high", needsProfessional: d.needsProfessional,
    createdBy: s.kind === "owner" || s.kind === "member" ? s.profileId : null, memberId: s.contactId, documentIds: slow.documentId ? [slow.documentId] : [], checkNote, actorName: s.name ?? "Family contact",
  });
  await t.run("update whatsapp_messages set request_id = $2, task_id = coalesce(task_id, $3) where id = $1", [m.id, made.id, made.taskId]);
  await setStatus(c, d.needsHuman ? "needs_human" : "routed");
  await reply(c, d.needsProfessional ? "professional" : "request_opened", { ref: made.ref });
}

async function runAfter(a: After): Promise<string[]> {
  if (a.kind === "withdraw_parent") {
    await withdrawByParentMessage(a.parentId);
    return [];
  }
  if (a.kind === "requeue") {
    const held = await asService(() => tx((t) => t.rows<Row>("update whatsapp_messages set status = 'received' where phone_hash = $1 and direction = 'in' and status = 'held_consent' returning id", [a.hash])));
    for (const h of held) await processMessage(h.id);
    return [];
  }
  // The owner's own decision, made as the owner, through the same functions as the app. The 5 minute undo applies.
  let ok = true;
  try {
    await withContext({ kind: "user", id: a.profileId }, () => tx((t) => t.one(a.verb === "undo" ? "select undo_approval($1)" : "select decide_approval($1,$2)", a.verb === "undo" ? [a.approvalId] : [a.approvalId, a.verb === "approve" ? "approved" : "declined"])));
  } catch {
    ok = false;
  }
  const id = await asService(() => tx((t) => queueReply(t, a.to, ok ? (a.verb === "approve" ? "approved" : a.verb === "decline" ? "declined" : "undone") : "approval_failed", a.vars)));
  return [id];
}

async function claim(id: string): Promise<Row | undefined> {
  return asService(() => tx((t) => t.one<Row>("update whatsapp_messages set status = 'processing', processing_at = now() where id = $1 and direction = 'in' and status = 'received' returning *", [id])));
}

/** Runs once per stored message. Safe to call twice: only a message still "received" is picked up. */
export async function processMessage(id: string): Promise<"done" | "skipped" | "failed"> {
  const m = await claim(id);
  if (!m) return "skipped";
  try {
    const e164 = decryptPhone(m.phone_enc);
    const replies: string[] = [];
    const after: After[] = [];
    const cmd = readCommand(m.text);
    const fast = await asService(() =>
      tx(async (t) => {
        const s = await identifySender(t, e164, m.phone_hash);
        const to: Recipient = { familyId: s.familyId, phoneHash: m.phone_hash, phoneEnc: m.phone_enc, phoneTail: m.phone_tail, language: guessLanguage(m.text, s.language) };
        const c: Ctx = { t, m, s, to, vars: { name: first(s.name), coordinator: s.coordinatorName ?? undefined }, replies, after };
        return { s, to, done: await handleFast(c, cmd, e164) };
      }),
    );
    if (!fast.done) {
      const slow = await slowWork(m, fast.s);
      // Read before the transaction: a second connection inside it would wait forever on a one-connection pool.
      const plans = await loadPlans();
      await asService(() => tx((t) => route({ t, m, s: fast.s, to: fast.to, vars: { name: first(fast.s.name), coordinator: fast.s.coordinatorName ?? undefined }, replies, after }, slow, plans)));
    }
    for (const a of after) replies.push(...(await runAfter(a)));
    await deliverAll(replies);
    log("info", "whatsapp_processed", { messageId: id });
    return "done";
  } catch (e) {
    log("error", "whatsapp_process_failed", { messageId: id, error: (e as Error).constructor.name });
    // No message is ever lost: whatever went wrong, a person sees it in the inbox.
    await asService(() =>
      tx(async (t) => {
        const row = await t.one<Row>("update whatsapp_messages set status = 'needs_human' where id = $1 and status = 'processing' returning family_id", [id]);
        if (row?.family_id) {
          await t.run(
            `insert into tasks(family_id, kind, title, status, owner_id, due_at, sla_at, hour_budget, source)
             select f.id, 'errand', 'Read a WhatsApp message by hand. Automatic handling failed.', 'todo', f.coordinator_id, now() + interval '2 hours', now() + interval '2 hours', 0.2, 'whatsapp' from families f where f.id = $1`,
            [row.family_id],
          );
        }
      }),
    ).catch(() => {});
    return "failed";
  }
}

/** Every few minutes: picks up anything a failed job left behind, so a message never sits unread. */
export async function runWhatsAppSweep(): Promise<{ processed: number; delivered: number }> {
  const ids = await asService(() =>
    tx(async (t) => {
      await t.run("update whatsapp_messages set status = 'received' where status = 'processing' and processing_at < now() - interval '10 minutes'");
      return t.rows<Row>("select id from whatsapp_messages where direction = 'in' and status = 'received' and received_at < now() - interval '1 minute' order by received_at limit 50");
    }),
  );
  for (const r of ids) await processMessage(r.id);
  const out = await asService(() => tx((t) => t.rows<Row>("select id from whatsapp_messages where direction = 'out' and status = 'queued' and created_at < now() - interval '1 minute' limit 50")));
  await deliverAll(out.map((o) => o.id));
  return { processed: ids.length, delivered: out.length };
}
