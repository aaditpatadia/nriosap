"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { recordPaymentAction, settlePaymentAction } from "@/app/ops/console-actions";
import { uploadFile } from "@/lib/upload-client";

type Msg = { ok: boolean; message: string } | null;
const Status = ({ s }: { s: Msg }) => <p role="status" aria-live="polite" className={`text-[length:var(--text-small)] ${s?.ok ? "text-ok" : "text-danger"}`}>{s?.message}</p>;

export function RecordPaymentForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(recordPaymentAction, null);
  return (
    <form action={action} key={state?.ok ? "saved" : "form"} className="card grid gap-3">
      <h2 className="section-title">How the customer pays</h2>
      <p className="text-[length:var(--text-small)] text-muted">Only after the customer approves. The customer pays the provider directly. Ally does not collect or split this money.</p>
      <input type="hidden" name="requestId" value={requestId} />
      <label className="field">Method<select className="input" name="method" defaultValue="provider_link"><option value="provider_link">Provider&apos;s own payment link</option><option value="bank_transfer">Bank transfer to the provider</option><option value="other">Something else</option></select></label>
      <label className="field">Payment link (https only)<input className="input" name="linkUrl" inputMode="url" maxLength={500} /></label>
      <label className="field">Note for the customer<input className="input" name="note" maxLength={300} /></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>Save</button>
      <Status s={state} />
    </form>
  );
}

export function SettlePaymentForm({ paymentId, familyId }: { paymentId: string; familyId: string }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function settle(status: "confirmed" | "failed") {
    setBusy(true);
    let receipt: string | null = null;
    const f = file.current?.files?.[0];
    if (f) {
      const up = await uploadFile({ familyId, file: f, purposes: ["store"], category: "banking" });
      if (!up.ok || !up.documentId) { setMsg({ ok: false, message: up.reason ?? "The receipt did not upload." }); setBusy(false); return; }
      receipt = up.documentId;
    }
    const r = await settlePaymentAction(paymentId, status, reference, receipt);
    setMsg({ ok: r.ok, message: r.ok ? "Saved." : (r.reason ?? "That did not save.") });
    setBusy(false);
    if (r.ok) router.refresh();
  }
  return (
    <div className="grid gap-2 text-[length:var(--text-small)]">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="field">Payment reference<input className="input" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} /></label>
        <label className="field">Receipt<input ref={file} className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" /></label>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => settle("confirmed")}>Mark confirmed</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => settle("failed")}>Mark failed</button></div>
      <Status s={msg} />
    </div>
  );
}
