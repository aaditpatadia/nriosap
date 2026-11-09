import "server-only";
import { strToU8, zipSync } from "fflate";
import { decryptField } from "./crypto";
import { asService, currentContext, isUuid, rows, tx } from "./db";
import { log } from "./log";
import { cancelForDeletion } from "./billing";
import { supabaseAdmin } from "./supabase";
import { BUCKET } from "./vault";

type Row = Record<string, any>;  

const TABLES = ["parents", "documents", "policies", "claims", "claim_requirements", "tasks", "time_entries", "approvals", "events", "messages", "document_consents", "subscriptions"] as const;

/** Everything held about one family, readable by a person. Runs under RLS: non-members get nothing. */
export async function exportData(familyId: string, viewerId: string): Promise<{ data: Record<string, unknown>; files: { name: string; path: string }[] } | null> {
  if (!isUuid(familyId)) return null;
  return tx(async (t) => {
    const fam = await t.one<Row>("select * from families where id = $1 and owner_id = $2", [familyId, viewerId]);
    if (!fam) return null;
    const data: Record<string, unknown> = { exported_at: new Date().toISOString(), family: fam };
    for (const table of TABLES) data[table] = await t.rows<Row>(`select * from ${table} where family_id = $1`, [familyId]);
    data.consents = await t.rows<Row>("select c.* from consents c join parents p on p.id = c.parent_id where p.family_id = $1", [familyId]);
    data.access_log = await t.rows<Row>("select action, entity, entity_id, at from audit_log where family_id = $1 order by at desc", [familyId]);
    const docs = data.documents as Row[];
    const files = docs.filter((d) => d.storage_path && !d.deleted_at).map((d) => ({ name: `${String(d.id).slice(0, 8)}-${String(d.title).replace(/[^\w.-]+/g, "_")}`, path: d.storage_path as string }));
    data.documents = docs.map(({ extracted_enc, storage_path: _s, ...d }) => ({ ...d, extracted: extracted_enc ? JSON.parse(decryptField(familyId, extracted_enc)) : null }));
    data.policies = (data.policies as Row[]).map(({ policy_no_enc, ...p }) => ({ ...p, policy_number: decryptField(familyId, policy_no_enc) }));
    await t.run("select audit_event('data_exported','family',$1,$2)", [familyId, familyId]);
    return { data, files };
  });
}

export async function exportZip(familyId: string, viewerId: string): Promise<Uint8Array | null> {
  const r = await exportData(familyId, viewerId);
  if (!r) return null;
  const entries: Record<string, Uint8Array> = { "data.json": strToU8(JSON.stringify(r.data, null, 2)) };
  for (const f of r.files) {
    const { data } = await supabaseAdmin().storage.from(BUCKET).download(f.path);
    if (data) entries[`documents/${f.name}`] = new Uint8Array(await data.arrayBuffer());
  }
  return zipSync(entries);
}

export async function withdrawParentConsent(parentId: string, via: string): Promise<boolean> {
  try {
    await tx((t) => t.run("select withdraw_parent_consent($1,$2)", [parentId, via]));
    await raiseWithdrawalTask(parentId);
    return true;
  } catch {
    return false;
  }
}

async function raiseWithdrawalTask(parentId: string) {
  await asService(() =>
    tx((t) =>
      t.run(
        `insert into tasks(family_id, kind, title, status, owner_id, due_at, sla_at, hour_budget)
         select f.id, 'checkin', 'Consent withdrawn: stop work and confirm with the family', 'todo', f.coordinator_id, now() + interval '4 hours', now() + interval '4 hours', 0.3
         from parents p join families f on f.id = p.family_id where p.id = $1`,
        [parentId],
      ),
    ),
  );
}

/** A parent's own WhatsApp message. Honoured at once, with no signed-in user. */
export async function withdrawByParentMessage(parentId: string) {
  await asService(() =>
    tx(async (t) => {
      const p = await t.one<Row>("select family_id from parents where id = $1", [parentId]);
      await t.run("update consents set withdrawn_at = now() where parent_id = $1 and subject = 'parent' and withdrawn_at is null and granted_at is not null", [parentId]);
      await t.run("update parents set consent_status = 'withdrawn' where id = $1", [parentId]);
      await t.run("update families set status = 'paused' where id = $1", [p!.family_id]);
      await t.run("insert into audit_log(action, entity, entity_id, family_id) values ('parent_consent_withdrawn:whatsapp','parent',$1,$2)", [parentId, p!.family_id]);
      await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'system','system','Desk','Consent was withdrawn. The desk has stopped work for this parent.')", [p!.family_id]);
    }),
  );
  await raiseWithdrawalTask(parentId);
}

/** Removes the family's files and rows. The audit log keeps ids and actions only, as proof of what happened. */
export async function deleteFamily(familyId: string, ownerId: string): Promise<void> {
  const ctx = await currentContext();
  if (ctx.kind !== "user" || ctx.id !== ownerId) throw new Error("not allowed");
  const owned = await rows<Row>("select id from families where id = $1 and owner_id = $2", [familyId, ownerId]);
  if (owned.length !== 1) throw new Error("not allowed");
  await cancelForDeletion(familyId);
  await asService(async () => {
    const docs = await rows<Row>("select storage_path from documents where family_id = $1 and storage_path <> ''", [familyId]);
    const voice = await rows<Row>("select media_ref from messages where family_id = $1 and media_ref is not null", [familyId]);
    const paths = [...docs.map((d) => d.storage_path), ...voice.map((v) => v.media_ref)];
    if (paths.length) await supabaseAdmin().storage.from(BUCKET).remove(paths);
    await tx(async (t) => {
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'family_deleted','family',$2,$3)", [ownerId, familyId, familyId]);
      await t.run("delete from families where id = $1", [familyId]);
    });
    const others = await rows<Row>("select 1 from families where owner_id = $1", [ownerId]);
    if (others.length === 0) await supabaseAdmin().auth.admin.deleteUser(ownerId);
  });
  log("info", "family_deleted", { familyId });
}
