import "server-only";
import type { Tx } from "./db";
import { asWaLang, type WaLang } from "./wa-templates";

type Row = Record<string, any>;

export type SenderKind = "owner" | "parent" | "member" | "contact" | "unknown";

export interface Sender {
  kind: SenderKind;
  familyId: string | null;
  familyName: string | null;
  parentId: string | null;
  profileId: string | null;
  contactId: string | null;
  name: string | null;
  /** Relation and role for a family member, for the desk only. */
  role: string | null;
  language: WaLang;
  coordinatorId: string | null;
  coordinatorName: string | null;
  /** Owner whose WhatsApp number was proved with a code from the app. Only this sender's approvals count. */
  verifiedOwner: boolean;
  consent: { handle: boolean; ai: boolean };
  /** Parents give consent on a coordinator's call, never by a WhatsApp reply. */
  consentByCallOnly: boolean;
}

const UNKNOWN: Sender = { kind: "unknown", familyId: null, familyName: null, parentId: null, profileId: null, contactId: null, name: null, role: null, language: "English", coordinatorId: null, coordinatorName: null, verifiedOwner: false, consent: { handle: false, ai: false }, consentByCallOnly: false };

const first = (n: string | null | undefined) => (n ? n.trim().split(/\s+/)[0] : null);

async function familyInfo(t: Tx, familyId: string) {
  return t.one<Row>("select f.id, f.name, f.coordinator_id, c.name as coordinator_name from families f left join profiles c on c.id = f.coordinator_id where f.id = $1", [familyId]);
}

async function waConsent(t: Tx, hash: string) {
  const r = await t.rows<Row>("select purpose from whatsapp_consents where phone_hash = $1 and granted_at is not null and withdrawn_at is null", [hash]);
  const p = new Set(r.map((x) => x.purpose));
  return { handle: p.has("handle"), ai: p.has("handle") && p.has("ai_read") };
}

/**
 * Who sent this, by normalised number. Order: an owner who linked this number, a parent, a family member
 * or WhatsApp-only contact, an owner whose profile has this number. Anyone else is unknown, and nothing
 * about any family is looked up or revealed for them.
 */
export async function identifySender(t: Tx, e164: string, hash: string): Promise<Sender> {
  const digits = e164.replace(/\D/g, "");
  const wa = await waConsent(t, hash);

  const linked = await t.one<Row>("select id, name from profiles where whatsapp_hash = $1 and whatsapp_verified_at is not null and role = 'owner'", [hash]);
  if (linked) return owner(t, linked, true, wa, hash);

  const parent = await t.one<Row>(
    `select p.id, p.name, p.language, p.consent_status, p.is_self, p.family_id, f.owner_id
     from parents p join families f on f.id = p.family_id where regexp_replace(coalesce(p.phone,''), '\\D', '', 'g') = $1 order by p.created_at limit 1`,
    [digits],
  );
  if (parent?.is_self) {
    const o = await t.one<Row>("select id, name from profiles where id = $1", [parent.owner_id]);
    if (o) return owner(t, o, false, wa, hash, parent.family_id);
  }
  if (parent) {
    const fam = await familyInfo(t, parent.family_id);
    const ai = await t.one<Row>("select 1 as ok from consents where parent_id = $1 and subject = 'parent' and purpose = 'read_records' and granted_at is not null and withdrawn_at is null", [parent.id]);
    const granted = parent.consent_status === "granted";
    return { ...UNKNOWN, kind: "parent", familyId: parent.family_id, familyName: fam?.name ?? null, parentId: parent.id, name: parent.name, role: "parent", language: asWaLang(parent.language), coordinatorId: fam?.coordinator_id ?? null, coordinatorName: first(fam?.coordinator_name), consent: { handle: granted, ai: granted && !!ai }, consentByCallOnly: true };
  }

  const member = await t.one<Row>(
    `select m.id, m.family_id, m.user_id, m.name, m.relation, m.role, m.language from family_members m
     where regexp_replace(coalesce(m.phone,''), '\\D', '', 'g') = $1 and m.status <> 'revoked' and (m.access_expires_at is null or m.access_expires_at > now())
     order by m.created_at limit 1`,
    [digits],
  );
  if (member) {
    const fam = await familyInfo(t, member.family_id);
    return { ...UNKNOWN, kind: member.user_id ? "member" : "contact", familyId: member.family_id, familyName: fam?.name ?? null, contactId: member.id, profileId: member.user_id, name: member.name, role: `${member.relation}, ${member.role}`, language: asWaLang(member.language), coordinatorId: fam?.coordinator_id ?? null, coordinatorName: first(fam?.coordinator_name), consent: wa };
  }

  const byPhone = await t.one<Row>("select id, name from profiles where role = 'owner' and regexp_replace(coalesce(phone,''), '\\D', '', 'g') = $1 limit 1", [digits]);
  if (byPhone) return owner(t, byPhone, false, wa, hash);
  return UNKNOWN;
}

async function owner(t: Tx, p: Row, verified: boolean, wa: { handle: boolean; ai: boolean }, _hash: string, familyId?: string): Promise<Sender> {
  const fam = familyId
    ? await familyInfo(t, familyId)
    : await t.one<Row>("select f.id, f.name, f.coordinator_id, c.name as coordinator_name from families f left join profiles c on c.id = f.coordinator_id where f.owner_id = $1 order by f.started_at limit 1", [p.id]);
  if (!fam) return { ...UNKNOWN, kind: "owner", profileId: p.id, name: p.name, verifiedOwner: verified, consent: wa };
  const c = await t.rows<Row>(
    "select c.purpose from consents c join parents x on x.id = c.parent_id where x.family_id = $1 and c.subject = 'owner' and c.granted_at is not null and c.withdrawn_at is null",
    [fam.id],
  );
  const given = new Set(c.map((r) => r.purpose));
  const lang = await t.one<Row>("select preferred_language from profiles where id = $1", [p.id]);
  return {
    ...UNKNOWN, kind: "owner", familyId: fam.id, familyName: fam.name, profileId: p.id, name: p.name, role: "owner", language: asWaLang(lang?.preferred_language), coordinatorId: fam.coordinator_id, coordinatorName: first(fam.coordinator_name), verifiedOwner: verified,
    consent: { handle: given.has("store") || wa.handle, ai: (given.has("store") && given.has("read_records")) || wa.ai },
  };
}
