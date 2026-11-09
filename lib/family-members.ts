import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { asService, isUuid, one, rows, tx } from "./db";
import { familyAccess } from "./service-requests";
import { WORDING_VERSION } from "./consent";
import type { Permission, Relation } from "./request-engine";

type Row = Record<string, any>;
const INVITE_DAYS = 7;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export interface FamilyMember { id: string; name: string; relation: Relation; permissions: Permission[]; status: "contact" | "invited" | "active" | "revoked"; phone: string | null; language: string | null; whatsappOk: boolean; isEmergency: boolean; inviteEmail: string | null; inviteExpiresAt: string | null; userId: string | null }

const toMember = (m: Row): FamilyMember => ({ id: m.id, name: m.name, relation: m.relation, permissions: m.permissions ?? [], status: m.status, phone: m.phone, language: m.language, whatsappOk: m.whatsapp_ok, isEmergency: m.is_emergency, inviteEmail: m.invite_email, inviteExpiresAt: m.invite_expires_at, userId: m.user_id });

export async function membersFor(familyId: string): Promise<FamilyMember[]> {
  if (!isUuid(familyId)) return [];
  return (await rows<Row>("select * from family_members where family_id = $1 and status <> 'revoked' order by created_at", [familyId])).map(toMember);
}

export interface NewMember { familyId: string; name: string; relation: Relation; permissions: Permission[]; email: string; phone: string | null; language: string; whatsappOk: boolean; isEmergency: boolean; invite: boolean; userId: string; base: string }

/** Only the account owner adds people. A member can be a WhatsApp contact with no login, so nobody is forced to use the app. */
export async function addMember(n: NewMember): Promise<{ ok: true; inviteLink?: string } | { ok: false; reason: string }> {
  if (!(await familyAccess(n.familyId)).owner) return { ok: false, reason: "Only the account owner can add people." };
  const token = n.invite ? randomBytes(32).toString("base64url") : null;
  await asService(() =>
    tx(async (t) => {
      const f = await t.one<Row>("select coordinator_id from families where id = $1", [n.familyId]);
      const m = await t.one<Row>(
        `insert into family_members(family_id, name, relation, permissions, status, invite_email, invite_token_hash, invite_expires_at, phone, language, whatsapp_ok, is_emergency, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [n.familyId, n.name, n.relation, n.permissions, n.invite ? "invited" : "contact", n.email || null, token ? hashToken(token) : null, token ? new Date(Date.now() + INVITE_DAYS * 86_400_000) : null, n.phone, n.language || null, n.whatsappOk, n.isEmergency, n.userId],
      );
      // Someone reached by phone agrees on a call first, in their own language.
      if (n.phone) {
        await t.run(
          `insert into tasks(family_id, kind, title, status, owner_id, due_at, sla_at, hour_budget, needs_approval, checklist)
           values ($1,'checkin',$2,'todo',$3, now() + interval '2 days', now() + interval '2 days', 0.5, false, $4)`,
          [n.familyId, `Consent call: ${n.name}`, f?.coordinator_id ?? null, ["Call in their language", "Read each purpose aloud", `Record only what they agree to (${WORDING_VERSION})`]],
        );
      }
      await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'system','system','Desk',$2)", [n.familyId, `${n.name} was added to this account.`]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'member_added','family_member',$2,$3)", [n.userId, m!.id, n.familyId]);
    }),
  );
  return { ok: true, inviteLink: token ? `${n.base}/invite/${token}` : undefined };
}

export async function setMemberPermissions(memberId: string, permissions: Permission[], userId: string): Promise<string | null> {
  if (!isUuid(memberId)) return null;
  const m = await one<Row>("select family_id from family_members where id = $1", [memberId]);
  if (!m || !(await familyAccess(m.family_id)).owner) return null;
  await asService(() =>
    tx(async (t) => {
      await t.run("update family_members set permissions = $2 where id = $1", [memberId, permissions]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'member_permissions_changed','family_member',$2,$3)", [userId, memberId, m.family_id]);
    }),
  );
  return m.family_id;
}

export async function revokeMember(memberId: string, userId: string): Promise<string | null> {
  if (!isUuid(memberId)) return null;
  const m = await one<Row>("select family_id from family_members where id = $1", [memberId]);
  if (!m || !(await familyAccess(m.family_id)).owner) return null;
  await asService(() =>
    tx(async (t) => {
      await t.run("update family_members set status = 'revoked', permissions = '{}', invite_token_hash = null where id = $1", [memberId]);
      await t.run("delete from document_shares where member_id = $1", [memberId]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'member_revoked','family_member',$2,$3)", [userId, memberId, m.family_id]);
    }),
  );
  return m.family_id;
}

export async function shareDocument(documentId: string, memberId: string, share: boolean, userId: string): Promise<string | null> {
  if (!isUuid(documentId) || !isUuid(memberId)) return null;
  const d = await one<Row>("select family_id from documents where id = $1 and deleted_at is null", [documentId]);
  if (!d || !(await familyAccess(d.family_id)).owner) return null;
  const done = await asService(() =>
    tx(async (t) => {
      const m = await t.one<Row>("select id from family_members where id = $1 and family_id = $2 and status = 'active'", [memberId, d.family_id]);
      if (!m) return false;
      if (share) await t.run("insert into document_shares(document_id, member_id, family_id, created_by) values ($1,$2,$3,$4) on conflict do nothing", [documentId, memberId, d.family_id, userId]);
      else await t.run("delete from document_shares where document_id = $1 and member_id = $2", [documentId, memberId]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,$2,'document',$3,$4)", [userId, share ? "document_shared" : "document_unshared", documentId, d.family_id]);
      return true;
    }),
  );
  return done ? d.family_id : null;
}

export async function setDocumentCategory(documentId: string, category: string, userId: string): Promise<string | null> {
  if (!isUuid(documentId)) return null;
  const d = await one<Row>("select family_id from documents where id = $1 and deleted_at is null", [documentId]);
  if (!d || !(await familyAccess(d.family_id)).owner) return null;
  await asService(() =>
    tx(async (t) => {
      await t.run("update documents set category = $2 where id = $1", [documentId, category]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'document_recategorised','document',$2,$3)", [userId, documentId, d.family_id]);
    }),
  );
  return d.family_id;
}

export async function sharesFor(familyId: string): Promise<{ documentId: string; memberId: string }[]> {
  if (!isUuid(familyId)) return [];
  return (await rows<Row>("select document_id, member_id from document_shares where family_id = $1", [familyId])).map((s) => ({ documentId: s.document_id, memberId: s.member_id }));
}

// ---------- Invitations ----------
export interface InvitePreview { id: string; familyId: string; familyName: string; name: string; email: string | null }

export async function inviteByToken(token: string): Promise<InvitePreview | undefined> {
  const r = await asService(() => one<Row>("select m.id, m.family_id, m.name, m.invite_email, f.name as family_name from family_members m join families f on f.id = m.family_id where m.invite_token_hash = $1 and m.status = 'invited' and m.invite_expires_at > now()", [hashToken(token)]));
  return r ? { id: r.id, familyId: r.family_id, familyName: r.family_name, name: r.name, email: r.invite_email } : undefined;
}

/** One use: the token is cleared as the link is accepted. */
export async function acceptInvite(token: string, user: { id: string; email: string | null }): Promise<{ ok: true; familyId: string } | { ok: false; reason: string }> {
  const inv = await inviteByToken(token);
  if (!inv) return { ok: false, reason: "This invitation has expired or was already used." };
  if (inv.email && inv.email.toLowerCase() !== (user.email ?? "").toLowerCase()) return { ok: false, reason: "This invitation was sent to a different email address." };
  return asService(() =>
    tx(async (t) => {
      const owner = await t.one<Row>("select owner_id from families where id = $1", [inv.familyId]);
      if (owner?.owner_id === user.id) return { ok: false as const, reason: "This is your own account." };
      const dup = await t.one<Row>("select 1 as x from family_members where family_id = $1 and user_id = $2 and status = 'active'", [inv.familyId, user.id]);
      if (dup) return { ok: false as const, reason: "You are already part of this account." };
      const n = await t.run("update family_members set user_id = $2, status = 'active', invite_token_hash = null, invite_expires_at = null where id = $1 and status = 'invited'", [inv.id, user.id]);
      if (!n) return { ok: false as const, reason: "This invitation has expired or was already used." };
      await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'system','system','Desk',$2)", [inv.familyId, `${inv.name} joined this account.`]);
      await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'member_joined','family_member',$2,$3)", [user.id, inv.id, inv.familyId]);
      return { ok: true as const, familyId: inv.familyId };
    }),
  );
}

// ---------- Profile preferences ----------
export interface Preferences { country: string | null; indiaCities: string[]; needs: string[]; language: string | null; channel: string | null; timezone: string | null; notifyUpdates: boolean }

export async function preferencesFor(userId: string): Promise<Preferences> {
  const p = await one<Row>("select country, india_cities, needs, preferred_language, preferred_channel, timezone, notify_updates from profiles where id = $1", [userId]);
  return { country: p?.country ?? null, indiaCities: p?.india_cities ?? [], needs: p?.needs ?? [], language: p?.preferred_language ?? null, channel: p?.preferred_channel ?? null, timezone: p?.timezone ?? null, notifyUpdates: p?.notify_updates ?? true };
}

/** Roles live on this table, so this writes only the named preference columns, for the signed-in person's own row. */
export async function savePreferences(userId: string, p: Preferences, markOnboarded = false): Promise<void> {
  await asService(() =>
    tx((t) =>
      t.run("update profiles set country = $2, india_cities = $3, needs = $4, preferred_language = $5, preferred_channel = $6, timezone = $7, notify_updates = $8, onboarded_at = case when $9 then coalesce(onboarded_at, now()) else onboarded_at end where id = $1", [userId, p.country, p.indiaCities, p.needs, p.language, p.channel, p.timezone, p.notifyUpdates, markOnboarded]),
    ),
  );
}
