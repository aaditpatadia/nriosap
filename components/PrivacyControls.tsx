"use client";

import { useActionState, useState, useTransition } from "react";
import { checkoutAction, deleteFamilyAction, portalAction, withdrawParentAction } from "@/app/family/actions";

export function WithdrawParentButton({ familyId, parentName }: { familyId: string; parentName: string }) {
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  if (!sure) return <button type="button" className="btn btn-secondary w-fit" onClick={() => setSure(true)}>Withdraw {parentName}&apos;s consent</button>;
  return (
    <div className="grid gap-2">
      <p className="text-danger">The desk will stop work for {parentName} straight away.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => start(async () => { await withdrawParentAction(familyId); setSure(false); })}>Yes, withdraw</button>
        <button type="button" className="btn btn-ghost" onClick={() => setSure(false)}>Keep it</button>
      </div>
    </div>
  );
}

export function DeleteFamilyForm({ familyId, familyName }: { familyId: string; familyName: string }) {
  const [s, action, pending] = useActionState(deleteFamilyAction, null);
  return (
    <form action={action} className="card grid gap-3">
      <h2 className="text-[length:var(--text-h3)] font-semibold">Delete everything</h2>
      <p className="text-muted">This removes every document, message and record for this family, and cancels the subscription. It cannot be undone. A log of ids and actions is kept as proof of what happened.</p>
      <input type="hidden" name="familyId" value={familyId} />
      <label className="field">Type {familyName} to confirm<input className="input" name="confirm" autoComplete="off" required /></label>
      <button className="btn btn-secondary w-fit" disabled={pending} style={{ color: "var(--danger)" }}>Delete this family&apos;s data</button>
      <p role="status" aria-live="polite" className="text-danger">{s?.message}</p>
    </form>
  );
}

export function BillingButtons({ familyId, hasSubscription }: { familyId: string; hasSubscription: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const go = (fn: (id: string) => Promise<{ reason?: string } | void>) => start(async () => { const r = await fn(familyId); if (r?.reason) setMsg(r.reason); });
  return (
    <div className="grid gap-2">
      {hasSubscription ? <button type="button" className="btn btn-secondary w-fit" disabled={pending} onClick={() => go(portalAction)}>Manage subscription</button> : <button type="button" className="btn btn-primary w-fit" disabled={pending} onClick={() => go(checkoutAction)}>Start subscription</button>}
      {msg && <p role="status" className="text-danger">{msg}</p>}
    </div>
  );
}
