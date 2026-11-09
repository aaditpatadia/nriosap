import "server-only";
import { randomUUID } from "node:crypto";
import { decryptField, encryptField } from "./crypto";
import { asService, isUuid, one, rows, tx, type Tx } from "./db";
import { getExtractor, type ExtractionResult } from "./extract";
import { log as writeLog } from "./log";
import { canAiActAlone } from "./rules";
import { getScanner } from "./scan";
import type { StoredField } from "./store";
import { supabaseAdmin } from "./supabase";
import { cleanTitle, sniffMime, type Purpose } from "./upload-rules";

export const BUCKET = "vault";
type Row = Record<string, any>;

// Logs carry ids, timings and error classes only. Never file names, text or field values.
const log = (event: string, data: Record<string, unknown>) => writeLog("info", event, data);

export type IngestResult = { ok: true; documentId: string; needsCheck: boolean; confidence: number } | { ok: false; reason: string; status: number };

export interface IngestInput {
  familyId: string;
  filename: string;
  bytes: Uint8Array;
  maxBytes: number;
  purposes: Purpose[];
  uploaderId: string | null;
  source: "web" | "whatsapp";
}

/**
 * Validates, scans, stores and reads one document. Callers must authorise access to the family first.
 * The AI read only happens when the read_records purpose was given for this document.
 */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  if (input.bytes.byteLength === 0) return { ok: false, reason: "That file is empty.", status: 400 };
  if (input.bytes.byteLength > input.maxBytes) return { ok: false, reason: `Please send a file under ${Math.floor(input.maxBytes / 1048576)} MB.`, status: 413 };
  const type = sniffMime(input.bytes);
  if (!type) return { ok: false, reason: "We accept PDF, JPG, PNG and WebP files.", status: 415 };
  if (!input.purposes.includes("store")) return { ok: false, reason: "We need your consent to keep this file before we can accept it.", status: 400 };

  const family = await asService(() => one<Row>("select f.id, f.coordinator_id, p.consent_status from families f join parents p on p.family_id = f.id where f.id = $1 limit 1", [input.familyId]));
  if (!family) return { ok: false, reason: "Family not found.", status: 404 };
  if (family.consent_status !== "granted") return { ok: false, reason: "Your parent's consent call must be finished before documents can be added.", status: 409 };

  const verdict = await getScanner().scan(input.bytes);
  if (verdict === "infected") {
    log("document_rejected_scan", { familyId: input.familyId });
    return { ok: false, reason: "This file did not pass the safety check.", status: 422 };
  }

  const id = randomUUID();
  const path = `${input.familyId}/${id}.${type.ext}`;
  const up = await supabaseAdmin().storage.from(BUCKET).upload(path, Buffer.from(input.bytes), { contentType: type.mime, upsert: false });
  if (up.error) {
    log("document_store_failed", { familyId: input.familyId });
    return { ok: false, reason: "We could not save the file. Please try again.", status: 502 };
  }

  const title = cleanTitle(input.filename);
  await asService(() =>
    tx(async (t) => {
      await t.run("insert into documents(id, family_id, kind, storage_path, title, mime, size_bytes, scan_status, uploaded_by, source) values ($1,$2,'report',$3,$4,$5,$6,$7,$8,$9)", [id, input.familyId, path, title, type.mime, input.bytes.byteLength, verdict, input.uploaderId, input.source]);
      for (const p of input.purposes) await t.run("insert into document_consents(document_id, family_id, purpose, granted_by) values ($1,$2,$3,$4)", [id, input.familyId, p, input.uploaderId]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'document_uploaded','document',$2,$3)", [input.uploaderId, id, input.familyId]);
      await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'document','system','Desk',$2)", [input.familyId, `New document received: ${title}.`]);
    }),
  );

  if (!input.purposes.includes("read_records")) {
    await asService(() => tx((t) => t.run("update documents set extraction_status = 'skipped' where id = $1", [id])));
    return { ok: true, documentId: id, needsCheck: false, confidence: 0 };
  }
  return extractAndStore(id, input.familyId, family.coordinator_id, title, type.mime, input.bytes);
}

function toStored(r: ExtractionResult): Record<string, StoredField> {
  return Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, { value: v, confidence: r.fieldConfidence[k] ?? 0 }]));
}

async function raiseCheckTask(t: Tx, familyId: string, coordinatorId: string | null, documentId: string, title: string) {
  await t.run(
    `insert into tasks(family_id, kind, title, status, owner_id, due_at, sla_at, hour_budget, needs_approval, document_id)
     values ($1,'records',$2,'todo',$3, now() + interval '1 day', now() + interval '1 day', 0.2, false, $4)`,
    [familyId, `Check document: ${title}`, coordinatorId, documentId],
  );
}

async function extractAndStore(id: string, familyId: string, coordinatorId: string | null, title: string, mime: string, bytes: Uint8Array): Promise<IngestResult> {
  const started = Date.now();
  let result: ExtractionResult;
  try {
    result = await getExtractor().extract({ filename: title, mime, bytes });
  } catch (e) {
    log("extraction_failed", { documentId: id, error: (e as Error).constructor.name });
    await asService(() =>
      tx(async (t) => {
        await t.run("update documents set extraction_status = 'failed', confidence = 0 where id = $1", [id]);
        await raiseCheckTask(t, familyId, coordinatorId, id, title);
      }),
    );
    return { ok: true, documentId: id, needsCheck: true, confidence: 0 };
  }
  const needsCheck = !canAiActAlone("extract_fields", result.confidence);
  log("extraction_done", { documentId: id, ms: Date.now() - started, confidence: result.confidence, fields: Object.keys(result.fields).length, needsCheck });
  await asService(() =>
    tx(async (t) => {
      await t.run("update documents set kind = $2, extracted_enc = $3, confidence = $4, extraction_status = 'done' where id = $1", [id, result.kind, encryptField(familyId, JSON.stringify(toStored(result))), Math.round(result.confidence * 100) / 100]);
      await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'document','ai',$2,$3)", [familyId, needsCheck ? "Prepared by AI, needs a check" : "Prepared by AI", needsCheck ? `${title} read. A coordinator will check it before anyone relies on it.` : `${title} read.`]);
      if (needsCheck) await raiseCheckTask(t, familyId, coordinatorId, id, title);
      else await upsertPolicy(t, familyId, id, result.kind, toStored(result));
    }),
  );
  return { ok: true, documentId: id, needsCheck, confidence: result.confidence };
}

const digits = (s: string | undefined) => {
  const n = Number((s ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const isoDate = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

async function upsertPolicy(t: Tx, familyId: string, documentId: string, kind: string, f: Record<string, StoredField>) {
  const no = f["Policy number"]?.value;
  const insurer = f["Insurer"]?.value;
  if (kind !== "policy" || !no || !insurer) return;
  await t.run(
    `insert into policies(family_id, insurer, policy_no_enc, sum_insured_inr, renewal_date, document_id) values ($1,$2,$3,$4,$5,$6)
     on conflict (document_id) do update set insurer = excluded.insurer, policy_no_enc = excluded.policy_no_enc, sum_insured_inr = excluded.sum_insured_inr, renewal_date = excluded.renewal_date`,
    [familyId, insurer, encryptField(familyId, no), digits(f["Sum insured"]?.value), isoDate(f["Renewal date"]?.value), documentId],
  );
}

/** Short-lived link to the file. Row visibility comes from RLS; every link issued is audited. */
export async function signedDocumentUrl(id: string): Promise<string | undefined> {
  if (!isUuid(id)) return undefined;
  return tx(async (t) => {
    const d = await t.one<Row>("select d.family_id, d.storage_path from documents d where d.id = $1 and d.deleted_at is null and exists (select 1 from document_consents c where c.document_id = d.id and c.purpose = 'store' and c.withdrawn_at is null)", [id]);
    if (!d) return undefined;
    const s = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(d.storage_path, 60);
    if (s.error || !s.data) return undefined;
    await t.run("select audit_event('view_document','document',$1,$2)", [id, d.family_id]);
    return s.data.signedUrl;
  });
}

export interface CheckDoc {
  id: string;
  familyId: string;
  title: string;
  kind: string;
  confidence: number;
  checked: boolean;
  fields: { label: string; value: string; confidence: number }[];
}

export async function documentForCheck(id: string): Promise<CheckDoc | undefined> {
  if (!isUuid(id)) return undefined;
  return tx(async (t) => {
    const d = await t.one<Row>("select * from documents where id = $1 and public.can_work_family(family_id) and deleted_at is null", [id]);
    if (!d) return undefined;
    await t.run("select audit_event('view_document_fields','document',$1,$2)", [id, d.family_id]);
    const f: Record<string, StoredField> = d.extracted_enc ? JSON.parse(decryptField(d.family_id, d.extracted_enc)) : {};
    return { id: d.id, familyId: d.family_id, title: d.title, kind: d.kind, confidence: Number(d.confidence ?? 0), checked: !!d.checked_at, fields: Object.entries(f).map(([label, v]) => ({ label, value: v.value, confidence: v.confidence })) };
  });
}

/** A coordinator confirms or corrects the fields. Checked values count as certain. */
export async function saveCheck(id: string, values: Record<string, string>, kind: string, userId: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return tx(async (t) => {
    const d = await t.one<Row>("select family_id, title from documents where id = $1 and deleted_at is null", [id]);
    if (!d) return false;
    const stored: Record<string, StoredField> = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, { value: v.trim().slice(0, 200), confidence: 1 }]));
    const n = await t.run("update documents set kind = $2, extracted_enc = $3, confidence = 1, checked_by = $4, checked_at = now(), extraction_status = 'done' where id = $1", [id, kind, encryptField(d.family_id, JSON.stringify(stored)), userId]);
    if (!n) return false;
    await t.run("update tasks set status = 'done' where document_id = $1 and status <> 'done'", [id]);
    await t.run("select audit_event('document_checked','document',$1,$2)", [id, d.family_id]);
    await upsertPolicy(t, d.family_id, id, kind, stored);
    return true;
  });
}

/** Withdrawing "store" removes the file and its extracted data at once. */
export async function withdrawDocumentConsent(id: string, purpose: Purpose): Promise<boolean> {
  if (!isUuid(id)) return false;
  await tx((t) => t.run("select withdraw_document_consent($1,$2)", [id, purpose]));
  if (purpose !== "store") return true;
  const d = await asService(() => one<Row>("select storage_path from documents where id = $1", [id]));
  if (d?.storage_path) await supabaseAdmin().storage.from(BUCKET).remove([d.storage_path]);
  await asService(() => tx((t) => t.run("update documents set extracted_enc = null, storage_path = '', deleted_at = now() where id = $1", [id])));
  return true;
}

export async function documentTaskLink(taskDocumentId: string | undefined) {
  if (!taskDocumentId) return undefined;
  return (await rows<Row>("select id, title from documents where id = $1", [taskDocumentId]))[0];
}
