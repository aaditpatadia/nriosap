import "server-only";
import { asService, one, tx } from "./db";
import { withdrawByParentMessage } from "./privacy";
import { isConsentWithdrawal, isEmergency } from "./rules";
import { supabaseAdmin } from "./supabase";
import { getTranscriber } from "./transcribe";
import { MAX_WHATSAPP_MEDIA_BYTES, type Purpose } from "./upload-rules";
import type { Language } from "./types";
import { BUCKET, ingestDocument } from "./vault";
import { downloadMedia } from "./wa-client";
import type { InboundMessage } from "./whatsapp";

type Row = Record<string, any>;

async function raiseEmergency(t: { run(sql: string, p?: unknown[]): Promise<number> }, familyId: string, coordinatorId: string | null, parentName: string) {
  await t.run(
    `insert into tasks(family_id, title, kind, status, owner_id, due_at, sla_at, hour_budget, needs_approval)
     values ($1,'EMERGENCY: call the parent now','errand','todo',$2,now(),now() + interval '10 minutes',1,false)`,
    [familyId, coordinatorId],
  );
  await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'message','system','Desk',$2)", [familyId, `Message from ${parentName} looks like an emergency. Coordinator alerted.`]);
}

export interface StoredInbound {
  matched: boolean;
  duplicate?: boolean;
  emergency?: boolean;
  familyId?: string;
  messageId?: string;
  parent?: { id: string; name: string; language: Language };
  coordinatorId?: string | null;
}

/** Stores the message and runs emergency detection in one transaction. Meta retries, so wa_id makes this idempotent. */
export async function storeInbound(m: Pick<InboundMessage, "from" | "id" | "type" | "text">, wa = true): Promise<StoredInbound> {
  return asService(() =>
    tx(async (t) => {
      const fam = await t.one<Row>(
        `select p.id as parent_id, p.name, p.language, f.id as family_id, f.coordinator_id
         from parents p join families f on f.id = p.family_id
         where regexp_replace(p.phone, '\\D', '', 'g') = $1 limit 1`,
        [m.from.replace(/\D/g, "")],
      );
      if (!fam) {
        await t.run("insert into webhook_unmatched(day, count) values (current_date, 1) on conflict (day) do update set count = webhook_unmatched.count + 1");
        return { matched: false };
      }
      const body = (m.text ?? "").slice(0, 4000) || (m.type === "audio" ? "Voice note" : m.type === "image" ? "Photo" : m.type === "document" ? "Document" : "");
      const row = await t.one<Row>(
        `insert into messages(family_id, parent_id, direction, body, language, wa_id, msg_type, status)
         values ($1,$2,'in',$3,$4,$5,$6,'received') on conflict (wa_id) where wa_id is not null do nothing returning id`,
        [fam.family_id, fam.parent_id, body, fam.language, wa ? m.id : null, m.type],
      );
      if (!row) return { matched: true, duplicate: true, familyId: fam.family_id };
      const emergency = isEmergency(m.text ?? "");
      if (emergency) await raiseEmergency(t, fam.family_id, fam.coordinator_id, fam.name);
      else await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'message','human',$2,$3)", [fam.family_id, fam.name, `Message from ${fam.name} received.`]);
      return { matched: true, emergency, familyId: fam.family_id, messageId: row.id, parent: { id: fam.parent_id, name: fam.name, language: fam.language }, coordinatorId: fam.coordinator_id };
    }),
  );
}

async function grantedPurposes(parentId: string): Promise<Purpose[]> {
  const rows = await asService(() => tx((t) => t.rows<Row>("select purpose from consents where parent_id = $1 and subject = 'parent' and granted_at is not null and withdrawn_at is null", [parentId])));
  return rows.map((r) => r.purpose).filter((p): p is Purpose => ["read_records", "store"].includes(p));
}

/** Downloads a photo or document and puts it through the same pipeline as a web upload. */
async function handleDocument(m: InboundMessage, s: StoredInbound) {
  const familyId = s.familyId!;
  const media = await downloadMedia(m.mediaId!, MAX_WHATSAPP_MEDIA_BYTES);
  const purposes = await grantedPurposes(s.parent!.id);
  const fail = async (title: string) =>
    asService(() =>
      tx((t) =>
        t.run(`insert into tasks(family_id, kind, title, status, owner_id, due_at, sla_at, hour_budget) values ($1,'records',$2,'todo',$3,now() + interval '4 hours',now() + interval '4 hours',0.2)`, [familyId, title, s.coordinatorId]),
      ),
    );
  if (!media) return void (await fail(`Ask ${s.parent!.name} to send their file again. We could not fetch it.`));
  if (!purposes.includes("store")) return void (await fail(`${s.parent!.name} sent a file before giving consent. It was not kept.`));
  const r = await ingestDocument({ familyId, filename: m.filename ?? "WhatsApp file", bytes: media.bytes, maxBytes: MAX_WHATSAPP_MEDIA_BYTES, purposes, uploaderId: null, source: "whatsapp" });
  if (r.ok) await asService(() => tx((t) => t.run("update messages set document_id = $2 where id = $1", [s.messageId, r.documentId])));
  else await fail(`A file from ${s.parent!.name} was refused: ${r.reason}`);
}

async function handleVoice(m: InboundMessage, s: StoredInbound) {
  const media = await downloadMedia(m.mediaId!, MAX_WHATSAPP_MEDIA_BYTES);
  if (!media) return;
  const path = `${s.familyId}/voice/${s.messageId}.ogg`;
  await supabaseAdmin().storage.from(BUCKET).upload(path, Buffer.from(media.bytes), { contentType: "audio/ogg", upsert: true });
  const result = await getTranscriber().transcribe({ bytes: media.bytes, mime: media.mime, language: s.parent!.language });
  const transcript = result.status === "done" ? result.text : null;
  await asService(() =>
    tx(async (t) => {
      await t.run("update messages set media_ref = $2, transcript = $3, transcript_status = $4 where id = $1", [s.messageId, path, transcript, result.status]);
      if (transcript && isEmergency(transcript)) await raiseEmergency(t, s.familyId!, s.coordinatorId ?? null, s.parent!.name);
    }),
  );
}

/** Slow work for one message. Runs after the webhook has already answered Meta. */
export async function processMedia(m: InboundMessage, s: StoredInbound) {
  if (!s.matched || s.duplicate) return;
  if (m.type === "text" && m.text && isConsentWithdrawal(m.text)) return withdrawByParentMessage(s.parent!.id);
  if (!m.mediaId) return;
  if (m.type === "audio") await handleVoice(m, s);
  else await handleDocument(m, s);
}

export const lastInboundAt = async (familyId: string) => (await one<{ at: string | null }>("select max(created_at) as at from messages where family_id = $1 and direction = 'in'", [familyId]))?.at ?? undefined;
