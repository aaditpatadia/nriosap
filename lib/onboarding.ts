import "server-only";
import { WORDING_VERSION } from "./consent";
import { asService, isUuid, rows, tx, type Tx } from "./db";
import { supabaseAdmin } from "./supabase";
import type { Language } from "./types";
import { PURPOSES, type Purpose } from "./upload-rules";

type Row = Record<string, any>;

export interface NewFamily {
  ownerId: string;
  coordinatorId?: string | null;
  parentName: string;
  phone: string;
  language: Language;
  city: string;
  planUsd: number;
  /** Purposes the owner has already agreed to. Empty when the desk starts the onboarding for them. */
  ownerPurposes: Purpose[];
  actorId: string;
}

async function leastBusyCoordinator(t: Tx): Promise<string | null> {
  const r = await t.one<Row>("select p.id from profiles p left join families f on f.coordinator_id = p.id where p.role = 'coordinator' group by p.id order by count(f.id), p.created_at limit 1");
  return r?.id ?? null;
}

export async function createFamily(n: NewFamily): Promise<{ ok: true; familyId: string } | { ok: false; reason: string }> {
  try {
    const familyId = await asService(() =>
      tx(async (t) => {
        const coordinator = n.coordinatorId ?? (await leastBusyCoordinator(t));
        const surname = n.parentName.trim().split(/\s+/).at(-1);
        const f = await t.one<Row>("insert into families(owner_id, coordinator_id, name, plan_usd, status) values ($1,$2,$3,$4,'onboarding') returning id", [n.ownerId, coordinator, `${surname} family`, n.planUsd]);
        const p = await t.one<Row>("insert into parents(family_id, name, phone, language, city, consent_status) values ($1,$2,$3,$4,$5,'pending') returning id", [f!.id, n.parentName.trim(), n.phone, n.language, n.city.trim()]);
        for (const purpose of PURPOSES) {
          await t.run("insert into consents(parent_id, subject, purpose, granted_at, wording_version, language) values ($1,'parent',$2,null,$3,$4)", [p!.id, purpose, WORDING_VERSION, n.language]);
          const given = n.ownerPurposes.includes(purpose);
          await t.run("insert into consents(parent_id, subject, purpose, granted_at, confirmed_by, confirmed_at, confirm_method, wording_version) values ($1,'owner',$2,$3,$4,$5,$6,$7)", [p!.id, purpose, given ? new Date() : null, given ? n.ownerId : null, given ? new Date() : null, given ? "owner_web" : null, WORDING_VERSION]);
        }
        await t.run(
          `insert into tasks(family_id, kind, title, status, owner_id, due_at, sla_at, hour_budget, needs_approval, checklist)
           values ($1,'checkin',$2,'todo',$3, now() + interval '2 days', now() + interval '2 days', 0.5, false, $4)`,
          [f!.id, `Consent call: ${n.parentName.trim()}`, coordinator, ["Call in the parent's language", "Read each purpose aloud", "Record only what they agree to"]],
        );
        await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'system','system','Desk',$2)", [f!.id, `Welcome. A coordinator will call ${n.parentName.trim()} in ${n.language} to confirm consent before anything starts.`]);
        await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'family_onboarded','family',$2,$3)", [n.actorId, f!.id, f!.id]);
        return f!.id as string;
      }),
    );
    return { ok: true, familyId };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, reason: "That WhatsApp number is already linked to a family." };
    throw e;
  }
}

/** Creates the owner's account if needed. They sign in later with a magic link, so no password is set. */
export async function ensureOwner(email: string, name: string): Promise<string> {
  const lower = email.toLowerCase();
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({ email: lower, email_confirm: true, user_metadata: { name } });
  if (!error) {
    await asService(() => tx((t) => t.run("update profiles set email = $2, name = $3 where id = $1", [data.user.id, lower, name])));
    return data.user.id;
  }
  const existing = await asService(() => tx((t) => t.one<Row>("select id, role from profiles where lower(email) = $1", [lower])));
  if (existing?.role === "owner") return existing.id;
  throw new Error("owner_conflict");
}

export interface ConsentRow { id: string; purpose: Purpose; subject: "parent" | "owner"; grantedAt?: string; withdrawnAt?: string; confirmedAt?: string; method?: string; confirmer?: string; notes?: string; wordingVersion?: string }

export async function consentsFor(familyId: string): Promise<ConsentRow[]> {
  if (!isUuid(familyId)) return [];
  const r = await rows<Row>(
    `select c.*, u.name as confirmer from consents c join parents p on p.id = c.parent_id left join profiles u on u.id = c.confirmed_by where p.family_id = $1 order by c.subject, c.purpose`,
    [familyId],
  );
  return r.map((x) => ({ id: x.id, purpose: x.purpose, subject: x.subject, grantedAt: x.granted_at ?? undefined, withdrawnAt: x.withdrawn_at ?? undefined, confirmedAt: x.confirmed_at ?? undefined, method: x.confirm_method ?? undefined, confirmer: x.confirmer ?? undefined, notes: x.notes ?? undefined, wordingVersion: x.wording_version ?? undefined }));
}

export async function confirmParentConsent(parentId: string, purposes: Purpose[], notes: string): Promise<"granted" | "pending" | null> {
  try {
    const r = await tx((t) => t.one<{ r: "granted" | "pending" }>("select confirm_parent_consent($1,$2,$3) as r", [parentId, purposes, notes.slice(0, 500)]));
    if (r) await tx((t) => t.run("update tasks set status = 'done' where title like 'Consent call:%' and status <> 'done' and family_id = (select family_id from parents where id = $1)", [parentId]));
    return r?.r ?? null;
  } catch {
    return null;
  }
}

export async function confirmOwnerConsent(familyId: string, purposes: Purpose[]): Promise<boolean> {
  try {
    await tx((t) => t.run("select confirm_owner_consent($1,$2)", [familyId, purposes]));
    return true;
  } catch {
    return false;
  }
}

export async function pauseForCounsel(parentId: string, reason: string): Promise<boolean> {
  try {
    await tx((t) => t.run("select pause_for_counsel($1,$2)", [parentId, reason.slice(0, 500)]));
    return true;
  } catch {
    return false;
  }
}

/** Coordinator asks the owner to approve something. Nothing happens until the owner says yes. */
export async function requestApproval(input: { taskId: string; summary: string; amountInr: number; payee: string; feesInr: number; when: string; evidenceIds: string[]; userId: string }): Promise<boolean> {
  if (!isUuid(input.taskId)) return false;
  return tx(async (t) => {
    const task = await t.one<Row>("select family_id from tasks where id = $1", [input.taskId]);
    if (!task) return false;
    await t.run("insert into approvals(family_id, task_id, summary, amount_inr, payee, fees_inr, when_text, evidence_ids, requested_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [task.family_id, input.taskId, input.summary, input.amountInr, input.payee, input.feesInr, input.when, input.evidenceIds, input.userId]);
    await t.run("update tasks set status = 'waiting_owner', needs_approval = true where id = $1", [input.taskId]);
    await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'approval','system','Desk',$2)", [task.family_id, `Waiting for your approval: ${input.summary}`]);
    await t.run("select audit_event('approval_requested','task',$1,$2)", [input.taskId, task.family_id]);
    return true;
  });
}

export async function addClaim(familyId: string, kind: string, hospital: string, amount: number, missing: string[]): Promise<boolean> {
  if (!isUuid(familyId)) return false;
  return tx(async (t) => {
    const c = await t.one<Row>("insert into claims(family_id, kind, status, hospital, amount_claimed_inr, sla_due_at) values ($1,$2,'preparing',$3,$4, now() + interval '4 days') returning id", [familyId, kind, hospital, amount]);
    for (const label of missing) await t.run("insert into claim_requirements(claim_id, family_id, label) values ($1,$2,$3)", [c!.id, familyId, label.slice(0, 120)]);
    await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'claim','system','Desk',$2)", [familyId, `Claim opened for ${hospital}.`]);
    await t.run("select audit_event('claim_opened','claim',$1,$2)", [c!.id, familyId]);
    return true;
  });
}

export async function setRequirementReceived(id: string, received: boolean): Promise<boolean> {
  if (!isUuid(id)) return false;
  return (await tx((t) => t.run("update claim_requirements set received_at = $2 where id = $1", [id, received ? new Date() : null]))) > 0;
}

export async function addRequirement(claimId: string, label: string): Promise<boolean> {
  if (!isUuid(claimId)) return false;
  return tx(async (t) => {
    const c = await t.one<Row>("select family_id from claims where id = $1", [claimId]);
    if (!c) return false;
    await t.run("insert into claim_requirements(claim_id, family_id, label) values ($1,$2,$3)", [claimId, c.family_id, label.slice(0, 120)]);
    return true;
  });
}

export async function setClaimStatus(id: string, status: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return tx(async (t) => {
    const c = await t.one<Row>("update claims set status = $2 where id = $1 returning family_id, hospital", [id, status]);
    if (!c) return false;
    await t.run("insert into events(family_id, kind, actor, actor_name, text) values ($1,'claim','system','Desk',$2)", [c.family_id, `Claim at ${c.hospital} is now: ${status}.`]);
    return true;
  });
}
