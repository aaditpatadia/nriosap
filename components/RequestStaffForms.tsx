"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { assignAction, evidenceAction, quoteAction, reportAction, setStatusFormAction, updateAction } from "@/app/family/platform-actions";
import { STATUS_META, type RequestStatus } from "@/lib/request-engine";
import { uploadFile } from "@/lib/upload-client";

const SETTABLE: RequestStatus[] = ["under_review", "awaiting_information", "quotation_ready", "assigned", "in_progress", "awaiting_customer", "completed", "cancelled"];
const Status = ({ s }: { s: { ok: boolean; message: string } | null }) => <p role="status" aria-live="polite" className={s?.ok ? "text-ok" : "text-danger"}>{s?.message}</p>;
const Title = ({ children }: { children: string }) => <h2 className="text-[length:var(--text-h3)] font-semibold">{children}</h2>;

export function StatusForm({ requestId, current }: { requestId: string; current: RequestStatus }) {
  const [state, action, pending] = useActionState(setStatusFormAction, null);
  return (
    <form action={action} className="card grid gap-3">
      <Title>Status</Title>
      <input type="hidden" name="requestId" value={requestId} />
      <label className="field">Move to
        <select className="input" name="status" defaultValue={SETTABLE.includes(current) ? current : "under_review"}>{SETTABLE.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select>
      </label>
      <label className="field">Message to the customer<input className="input" name="note" maxLength={500} /></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>Update status</button>
      <Status s={state} />
    </form>
  );
}

export function AssignForm({ requestId, providerName, estimatedCompletion, coordinators }: { requestId: string; providerName: string; estimatedCompletion: string; coordinators: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(assignAction, null);
  return (
    <form action={action} className="card grid gap-3">
      <Title>Assignment</Title>
      <input type="hidden" name="requestId" value={requestId} />
      {coordinators.length > 0 && <label className="field">Coordinator<select className="input" name="coordinatorId" defaultValue=""><option value="">Keep as is</option>{coordinators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      <label className="field">Service provider<input className="input" name="providerName" maxLength={120} defaultValue={providerName} /></label>
      <label className="field">Expected by<input className="input" type="date" name="estimatedCompletion" defaultValue={estimatedCompletion} /></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>Save assignment</button>
      <Status s={state} />
    </form>
  );
}

export function QuoteForm({ requestId, providerName }: { requestId: string; providerName: string }) {
  const [state, action, pending] = useActionState(quoteAction, null);
  const [fees, setFees] = useState({ providerFee: "", coordinationFee: "", taxes: "" });
  const total = Object.values(fees).reduce((n, v) => n + (Number(v) || 0), 0);
  const field = (name: keyof typeof fees, label: string) => <label className="field">{label}<input className="input" name={name} inputMode="numeric" value={fees[name]} onChange={(e) => setFees({ ...fees, [name]: e.target.value })} /></label>;
  return (
    <form action={action} key={state?.ok ? "sent" : "form"} className="card grid gap-3">
      <Title>Send a quotation</Title>
      <input type="hidden" name="requestId" value={requestId} />
      <label className="field">Provider<input className="input" name="providerName" maxLength={120} defaultValue={providerName} /></label>
      <div className="grid gap-3 sm:grid-cols-3">{field("providerFee", "Provider fee (Rs)")}{field("coordinationFee", "Ally fee (Rs)")}{field("taxes", "Taxes (Rs)")}</div>
      <label className="field">Expected by<input className="input" type="date" name="estimatedCompletion" /></label>
      <label className="field">Notes for the customer<textarea className="input" name="notes" rows={2} maxLength={1000} /></label>
      <p className="font-semibold">Total: Rs {total.toLocaleString("en-IN")}</p>
      <button className="btn btn-primary w-fit" disabled={pending || total <= 0}>Send to the customer</button>
      <Status s={state} />
    </form>
  );
}

export function UpdateForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(updateAction, null);
  return (
    <form action={action} key={state?.ok ? "saved" : "form"} className="card grid gap-3">
      <Title>Add an update</Title>
      <input type="hidden" name="requestId" value={requestId} />
      <label className="field">What happened?<textarea className="input" name="body" rows={2} maxLength={1000} required /></label>
      <label className="flex min-h-12 items-center gap-3"><input type="checkbox" name="internal" className="size-6" /><span>Internal note. The customer will not see it.</span></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>Save update</button>
      <Status s={state} />
    </form>
  );
}

export function EvidenceForm({ requestId, familyId }: { requestId: string; familyId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return setMsg({ ok: false, message: "Please choose a file." });
    setBusy(true);
    // Proof is stored but not sent to the AI reader.
    const up = await uploadFile({ familyId, file, purposes: ["store"] });
    if (!up.ok || !up.documentId) setMsg({ ok: false, message: up.reason ?? "That did not upload." });
    else {
      const r = await evidenceAction(requestId, up.documentId, caption);
      setMsg({ ok: r.ok, message: r.ok ? "Proof added." : (r.reason ?? "That did not save.") });
      if (r.ok) { setCaption(""); if (input.current) input.current.value = ""; router.refresh(); }
    }
    setBusy(false);
  }
  return (
    <form onSubmit={send} className="card grid gap-3">
      <Title>Add proof of work</Title>
      <label className="field">Photo, receipt or document<input ref={input} className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" /></label>
      <label className="field">What does it show?<input className="input" maxLength={200} value={caption} onChange={(e) => setCaption(e.target.value)} /></label>
      <button className="btn btn-secondary w-fit" disabled={busy}>{busy ? "Uploading..." : "Add proof"}</button>
      <Status s={msg} />
    </form>
  );
}

export function FinalReportForm({ requestId, report }: { requestId: string; report: string }) {
  const [state, action, pending] = useActionState(reportAction, null);
  return (
    <form action={action} className="card grid gap-3">
      <Title>Completion report</Title>
      <input type="hidden" name="requestId" value={requestId} />
      <label className="field">What was done, and by whom?<textarea className="input" name="report" rows={4} maxLength={4000} defaultValue={report} required /></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>Save report</button>
      <Status s={state} />
    </form>
  );
}
