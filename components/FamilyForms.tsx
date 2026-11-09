"use client";

import { useActionState, useState, useTransition } from "react";
import { addMemberAction, memberPermissionsAction, revokeMemberAction } from "@/app/family/platform-actions";
import { DEFAULT_PERMISSIONS, PERMISSIONS, RELATIONS, type Permission, type Relation } from "@/lib/request-engine";
import type { FamilyMember } from "@/lib/family-members";

const STATUS: Record<string, string> = { contact: "WhatsApp contact", invited: "Invitation sent", active: "Joined" };

function PermissionBoxes({ selected, onChange }: { selected: Permission[]; onChange?: (p: Permission[]) => void }) {
  return (
    <fieldset className="grid gap-1">
      <legend className="font-semibold">What they can do</legend>
      {(Object.entries(PERMISSIONS) as [Permission, string][]).map(([k, label]) => (
        <label key={k} className="flex min-h-12 items-center gap-3">
          <input type="checkbox" name="permission" value={k} className="size-6" checked={selected.includes(k)} onChange={(e) => onChange?.(e.target.checked ? [...selected, k] : selected.filter((x) => x !== k))} />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function AddMemberForm({ familyId }: { familyId: string }) {
  const [state, action, pending] = useActionState(addMemberAction, null);
  const [relation, setRelation] = useState<Relation>("parent");
  const [access, setAccess] = useState<"contact" | "invite">("contact");
  const [perms, setPerms] = useState<Permission[]>(DEFAULT_PERMISSIONS.parent);
  return (
    <form action={action} className="card grid gap-4">
      <h2 className="text-[length:var(--text-h3)] font-semibold">Add someone</h2>
      <input type="hidden" name="familyId" value={familyId} />
      <label className="field">Their name<input className="input" name="name" maxLength={120} required /></label>
      <label className="field">Who are they?
        <select className="input" name="relation" value={relation} onChange={(e) => { const r = e.target.value as Relation; setRelation(r); setPerms(DEFAULT_PERMISSIONS[r]); }}>
          {Object.entries(RELATIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <fieldset className="grid gap-1">
        <legend className="font-semibold">How will they take part?</legend>
        <label className="flex min-h-12 items-center gap-3"><input type="radio" name="access" value="contact" className="size-6" checked={access === "contact"} onChange={() => setAccess("contact")} /><span>WhatsApp only, no app</span></label>
        <label className="flex min-h-12 items-center gap-3"><input type="radio" name="access" value="invite" className="size-6" checked={access === "invite"} onChange={() => setAccess("invite")} /><span>Invite them to sign in</span></label>
      </fieldset>
      <label className="field">WhatsApp number{access === "invite" ? " (optional)" : ""}<input className="input" name="phone" inputMode="tel" maxLength={24} placeholder="+91 98000 00000" /></label>
      {access === "invite" && <label className="field">Their email (optional)<span className="font-normal text-muted">If you add it, only that Google account can accept.</span><input className="input" name="email" type="email" maxLength={200} /></label>}
      <label className="field">Language they prefer
        <select className="input" name="language" defaultValue="Hindi"><option>Hindi</option><option>Gujarati</option><option>Marathi</option><option>English</option></select>
      </label>
      <label className="flex min-h-12 items-center gap-3"><input type="checkbox" name="whatsappOk" className="size-6" defaultChecked /><span>Happy to be contacted on WhatsApp</span></label>
      <label className="flex min-h-12 items-center gap-3"><input type="checkbox" name="isEmergency" className="size-6" /><span>Emergency contact</span></label>
      {access === "invite" && <PermissionBoxes selected={perms} onChange={setPerms} />}
      <p className="text-[length:var(--text-small)] text-muted">If you give a WhatsApp number, your coordinator calls them to confirm they agree, in their own language, before anything involving them starts.</p>
      <button className="btn btn-primary w-fit" disabled={pending}>Add</button>
      <div role="status" aria-live="polite" className="grid gap-2">
        {state && <p className={state.ok ? "text-ok" : "text-danger"}>{state.message}</p>}
        {state?.link && <input className="input" readOnly value={state.link} aria-label="Invitation link" onFocus={(e) => e.target.select()} />}
      </div>
    </form>
  );
}

export function MemberCard({ member }: { member: FamilyMember }) {
  const [state, action, saving] = useActionState(memberPermissionsAction, null);
  const [perms, setPerms] = useState<Permission[]>(member.permissions);
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  return (
    <article className="card grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[length:var(--text-h3)] font-semibold">{member.name}</h2>
        <span className="flex flex-wrap gap-2">{member.isEmergency && <span className="chip" data-tone="warn">Emergency contact</span>}<span className="chip" data-tone={member.status === "active" ? "ok" : undefined}>{STATUS[member.status]}</span></span>
      </div>
      <p className="text-muted">{RELATIONS[member.relation]}{member.language ? ` · ${member.language}` : ""}{member.phone ? ` · ${member.phone}` : ""}</p>
      {member.status !== "contact" && (
        <form action={action} className="grid gap-3">
          <input type="hidden" name="memberId" value={member.id} />
          <PermissionBoxes selected={perms} onChange={setPerms} />
          <button className="btn btn-secondary w-fit" disabled={saving}>Save</button>
          {state && <p role="status" className={state.ok ? "text-ok" : "text-danger"}>{state.message}</p>}
        </form>
      )}
      {sure ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-danger">Remove {member.name}? They lose access at once.</span>
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => start(async () => { await revokeMemberAction(member.id); })}>Yes, remove</button>
          <button type="button" className="btn btn-ghost" onClick={() => setSure(false)}>Keep</button>
        </div>
      ) : <button type="button" className="btn btn-ghost w-fit" onClick={() => setSure(true)}>Remove</button>}
    </article>
  );
}
