"use client";

import { useActionState, useState, useTransition } from "react";
import { addClaimAction, addRequirementAction, consentCallAction, pauseCounselAction, requestApprovalAction, resolveAlertAction, setClaimStatusAction, staffOnboardAction, toggleRequirementAction } from "@/app/ops/actions";
import { PLAN_NAME, PLAN_PRICES } from "@/lib/consent";
import type { Purpose } from "@/lib/upload-rules";

export function StaffOnboardForm() {
  const [s, action, pending] = useActionState(staffOnboardAction, null);
  return (
    <form action={action} className="card grid gap-4">
      <label className="field">Owner&apos;s name<input className="input" name="ownerName" required maxLength={120} /></label>
      <label className="field">Owner&apos;s email<input className="input" type="email" name="ownerEmail" required maxLength={200} /></label>
      <label className="field">Parent&apos;s name<input className="input" name="parentName" required maxLength={120} /></label>
      <label className="field">Parent&apos;s WhatsApp number<input className="input" name="phone" inputMode="tel" required placeholder="+91 98000 00000" /></label>
      <label className="field">City in India<input className="input" name="city" required maxLength={80} /></label>
      <label className="field">Language
        <select className="input" name="language"><option>Hindi</option><option>Gujarati</option><option>Marathi</option><option>English</option></select>
      </label>
      <label className="field">Plan
        <select className="input" name="plan" defaultValue="79">{PLAN_PRICES.map((p) => <option key={p} value={p}>{PLAN_NAME[p]}: ${p} a month</option>)}</select>
      </label>
      <button className="btn btn-primary" disabled={pending}>Create family</button>
      <p role="status" aria-live="polite" className="text-danger">{s?.message}</p>
    </form>
  );
}

export function ConsentCallForm({ familyId, parentId, items }: { familyId: string; parentId: string; items: { purpose: Purpose; label: string; script: string; already: boolean }[] }) {
  const [s, action, pending] = useActionState(consentCallAction, null);
  const [paused, setPaused] = useState("");
  const [busy, start] = useTransition();
  const [reason, setReason] = useState("");
  return (
    <>
      <form action={action} className="card grid gap-4">
        <input type="hidden" name="familyId" value={familyId} />
        <input type="hidden" name="parentId" value={parentId} />
        <fieldset className="grid gap-3">
          <legend className="font-semibold">What did they agree to?</legend>
          {items.map((i) => (
            <label key={i.purpose} className="flex items-start gap-3">
              <input type="checkbox" name="purpose" value={i.purpose} defaultChecked={i.already} className="mt-1 size-6 shrink-0" />
              <span><span className="block font-semibold">{i.label}</span><span lang={undefined} className="block text-muted">{i.script}</span></span>
            </label>
          ))}
        </fieldset>
        <label className="field">Note about the call<textarea className="input" name="notes" rows={2} maxLength={500} /></label>
        <button className="btn btn-primary" disabled={pending}>Record the call</button>
        <p role="status" aria-live="polite" className={s?.ok ? "text-ok" : "text-danger"}>{s?.message}</p>
      </form>
      <div className="card grid gap-3">
        <h2 className="text-[length:var(--text-h3)] font-semibold">They cannot decide for themselves</h2>
        <p className="text-[length:var(--text-small)] text-muted">Because of illness, memory or anything else. Do not go further. The family is paused and routed to counsel.</p>
        <label className="field">What happened<input className="input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></label>
        <button type="button" className="btn btn-secondary" disabled={busy || !reason.trim()} onClick={() => start(async () => { const r = await pauseCounselAction(familyId, parentId, reason); setPaused(r.ok ? "Paused. The founder has a task to speak to counsel." : "That did not save."); })}>Pause this family</button>
        <p role="status" aria-live="polite" className="text-muted">{paused}</p>
      </div>
    </>
  );
}

export function RequestApprovalForm({ taskId }: { taskId: string }) {
  const [s, action, pending] = useActionState(requestApprovalAction, null);
  return (
    <form action={action} className="card grid gap-3">
      <h2 className="text-[length:var(--text-h3)] font-semibold">Ask the owner to approve</h2>
      <input type="hidden" name="taskId" value={taskId} />
      <label className="field">What is it?<input className="input" name="summary" required maxLength={200} /></label>
      <label className="field">Who is paid or sent to?<input className="input" name="payee" required maxLength={120} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="field">Amount (Rs)<input className="input" name="amount" type="number" min={0} defaultValue={0} inputMode="numeric" /></label>
        <label className="field">Fees (Rs)<input className="input" name="fees" type="number" min={0} defaultValue={0} inputMode="numeric" /></label>
      </div>
      <label className="field">When<input className="input" name="when" required maxLength={80} /></label>
      <button className="btn btn-secondary" disabled={pending}>Send for approval</button>
      <p role="status" aria-live="polite" className={s?.ok ? "text-ok" : "text-danger"}>{s?.message}</p>
    </form>
  );
}

const CLAIM_STATUS = [["preparing", "Preparing"], ["submitted", "Submitted"], ["query", "Insurer has a question"], ["approved", "Approved"], ["settled", "Settled"]] as const;

export function ClaimControls({ claimId, status }: { claimId: string; status: string }) {
  const [pending, start] = useTransition();
  const [s, action] = useActionState(addRequirementAction, null);
  return (
    <div className="grid gap-3 rounded-[var(--radius-control)] bg-tint p-3">
      <p className="text-[length:var(--text-small)] font-semibold">Desk controls</p>
      <label className="field">Status
        <select className="input" defaultValue={status} disabled={pending} onChange={(e) => start(async () => { await setClaimStatusAction(claimId, e.target.value); })}>
          {CLAIM_STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <form action={action} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <input type="hidden" name="claimId" value={claimId} />
        <label className="field">Add a missing document<input className="input" name="label" required maxLength={120} /></label>
        <button className="btn btn-secondary">Add</button>
      </form>
      {s?.message && <p role="status" className="text-danger">{s.message}</p>}
    </div>
  );
}

export function ClearAlert({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => start(async () => { await resolveAlertAction(id); })}>Clear</button>;
}

export function RequirementToggle({ id, received, label }: { id: string; received: boolean; label: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-ghost" disabled={pending} aria-label={`${received ? "Mark as still missing" : "Mark as received"}: ${label}`} onClick={() => start(async () => { await toggleRequirementAction(id, !received); })}>{received ? "Undo" : "Mark received"}</button>;
}

export function NewClaimForm({ familyId }: { familyId: string }) {
  const [s, action, pending] = useActionState(addClaimAction, null);
  return (
    <form action={action} className="card grid gap-3">
      <h2 className="text-[length:var(--text-h3)] font-semibold">Open a claim</h2>
      <input type="hidden" name="familyId" value={familyId} />
      <label className="field">Hospital<input className="input" name="hospital" required maxLength={160} /></label>
      <label className="field">Type<select className="input" name="kind"><option value="cashless">Cashless</option><option value="reimbursement">Reimbursement</option></select></label>
      <label className="field">Amount claimed (Rs)<input className="input" name="amount" type="number" min={0} defaultValue={0} inputMode="numeric" /></label>
      <label className="field">Documents still missing (one per line)<textarea className="input" name="missing" rows={3} maxLength={1000} /></label>
      <button className="btn btn-secondary" disabled={pending}>Open claim</button>
      <p role="status" aria-live="polite" className={s?.ok ? "text-ok" : "text-danger"}>{s?.message}</p>
    </form>
  );
}
