"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { addPartnerAction, completeVisitAction, escalateAction, movePartnerAction, partnerFeedbackAction, priorityAction, savePlanAction, scheduleVisitAction } from "@/app/ops/console-actions";
import type { Plan } from "@/lib/plan-rules";
import { uploadFile } from "@/lib/upload-client";
import type { PartnerStatus } from "@/lib/workspace-rules";

type Msg = { ok: boolean; message: string } | null;
const Status = ({ s }: { s: Msg }) => <p role="status" aria-live="polite" className={`text-[length:var(--text-small)] ${s?.ok ? "text-ok" : "text-danger"}`}>{s?.message}</p>;

export function AddPartnerForm() {
  const [state, action, pending] = useActionState(addPartnerAction, null);
  return (
    <form action={action} key={state?.ok ? "saved" : "form"} className="card grid gap-3">
      <h2 className="section-title">Add a service partner</h2>
      <label className="field">Name<input className="input" name="name" maxLength={120} required /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">Service<input className="input" name="category" maxLength={80} required placeholder="Plumbing" /></label>
        <label className="field">City<input className="input" name="city" maxLength={80} /></label>
        <label className="field">Phone<input className="input" name="phone" maxLength={24} /></label>
        <label className="field">Email<input className="input" name="email" type="email" maxLength={200} /></label>
      </div>
      <label className="field">Availability<input className="input" name="availability" maxLength={200} /></label>
      <label className="field">Notes<textarea className="input" name="notes" rows={2} maxLength={1000} /></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>Add</button>
      <Status s={state} />
    </form>
  );
}

const NEXT: Record<PartnerStatus, { to: PartnerStatus; label: string }[]> = {
  not_reviewed: [{ to: "identity_checked", label: "I checked their identity" }, { to: "suspended", label: "Suspend" }],
  identity_checked: [{ to: "references_checked", label: "I checked their references" }, { to: "suspended", label: "Suspend" }],
  references_checked: [{ to: "approved", label: "Approve for use" }, { to: "suspended", label: "Suspend" }],
  approved: [{ to: "suspended", label: "Suspend" }],
  suspended: [{ to: "identity_checked", label: "Start review again" }],
};

export function PartnerActions({ id, name, status }: { id: string; name: string; status: PartnerStatus }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {NEXT[status].map((n) => <button key={n.to} type="button" className={n.to === "suspended" ? "btn btn-ghost" : "btn btn-secondary"} disabled={pending} aria-label={`${n.label}: ${name}`} onClick={() => start(async () => { const r = await movePartnerAction(id, n.to); setError(r.ok ? "" : (r.reason ?? "That did not save.")); })}>{n.label}</button>)}
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  );
}

export function PartnerFeedbackForm({ partnerId }: { partnerId: string }) {
  const [state, action, pending] = useActionState(partnerFeedbackAction, null);
  return (
    <form action={action} key={state?.ok ? "saved" : "form"} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="partnerId" value={partnerId} />
      <label className="field min-w-0 flex-1 basis-56">Add feedback<input className="input" name="body" maxLength={500} required /></label>
      <button className="btn btn-secondary" disabled={pending}>Save</button>
      {state?.ok === false && <Status s={state} />}
    </form>
  );
}

export function ScheduleVisitForm({ families, properties }: { families: { id: string; name: string }[]; properties: { id: string; familyId: string; name: string }[] }) {
  const [state, action, pending] = useActionState(scheduleVisitAction, null);
  const [family, setFamily] = useState(families[0]?.id ?? "");
  return (
    <form action={action} key={state?.ok ? "saved" : "form"} className="card grid gap-3">
      <h2 className="section-title">Schedule a visit</h2>
      <label className="field">Family<select className="input" name="familyId" value={family} onChange={(e) => setFamily(e.target.value)}>{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label className="field">Property<select className="input" name="propertyId" defaultValue=""><option value="">None</option>{properties.filter((p) => p.familyId === family).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="field">Request reference (paste the request id, if any)<input className="input" name="requestId" maxLength={40} /></label>
      <label className="field">Purpose<input className="input" name="purpose" maxLength={200} required /></label>
      <label className="field">Date and time in India<input className="input" type="datetime-local" name="when" required /></label>
      <button className="btn btn-secondary w-fit" disabled={pending || !family}>Schedule</button>
      <Status s={state} />
    </form>
  );
}

export function VisitReportForm({ visitId, familyId, purpose }: { visitId: string; familyId: string; purpose: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({ notes: "", issues: "", nextSteps: "", followUp: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const photoIds: string[] = [];
    for (const file of [...(input.current?.files ?? [])].slice(0, 10)) {
      const up = await uploadFile({ familyId, file, purposes: ["store"], category: "property" });
      if (up.ok && up.documentId) photoIds.push(up.documentId);
      else { setMsg({ ok: false, message: up.reason ?? "A photo did not upload." }); setBusy(false); return; }
    }
    const r = await completeVisitAction(visitId, { ...f, photoIds });
    setMsg({ ok: r.ok, message: r.ok ? "Report saved." : (r.reason ?? "That did not save.") });
    setBusy(false);
    if (r.ok) router.refresh();
  }
  const text = (key: keyof typeof f, label: string, rows = 2) => <label className="field">{label}<textarea className="input" rows={rows} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} /></label>;
  return (
    <details className="text-[length:var(--text-small)]">
      <summary className="flex min-h-12 cursor-pointer items-center font-semibold">Write the report for {purpose}</summary>
      <form onSubmit={send} className="grid gap-3">
        {text("notes", "What was found", 3)}
        {text("issues", "Issues identified")}
        {text("nextSteps", "Recommended next steps")}
        <label className="field">Photos<input ref={input} className="input" type="file" multiple accept="image/jpeg,image/png,image/webp" /></label>
        {text("followUp", "Follow-up request, if one is needed")}
        <p className="text-muted">Photos are shown as taken. Ally does not independently verify them.</p>
        <button className="btn btn-secondary w-fit" disabled={busy}>{busy ? "Saving..." : "Save report"}</button>
        <Status s={msg} />
      </form>
    </details>
  );
}

export function PriorityToggle({ requestId, urgent }: { requestId: string; urgent: boolean }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => start(async () => { await priorityAction(requestId, urgent ? "normal" : "urgent"); })}>{urgent ? "Set to normal priority" : "Set to urgent"}</button>;
}

export function EscalateForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(escalateAction, null);
  return (
    <form action={action} key={state?.ok ? "saved" : "form"} className="card grid gap-3">
      <h2 className="section-title">Escalate</h2>
      <input type="hidden" name="requestId" value={requestId} />
      <label className="field">Why? (internal)<input className="input" name="reason" maxLength={500} required /></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>Escalate</button>
      <Status s={state} />
    </form>
  );
}

export function PlanForm({ plan }: { plan: Plan }) {
  const [state, action, pending] = useActionState(savePlanAction, null);
  return (
    <form action={action} className="card grid gap-3">
      <input type="hidden" name="slug" value={plan.slug} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="field">Name<input className="input" name="name" maxLength={40} defaultValue={plan.name} /></label>
        <label className="field">Price (USD a month)<input className="input" name="price" inputMode="decimal" defaultValue={plan.priceUsd} /></label>
        <label className="field">New requests a month (blank means no limit)<input className="input" name="limit" inputMode="numeric" defaultValue={plan.requestsPerMonth ?? ""} /></label>
      </div>
      <label className="field">Short description<input className="input" name="blurb" maxLength={200} defaultValue={plan.blurb} /></label>
      <label className="field">What is included, one per line<textarea className="input" name="features" rows={5} maxLength={1500} defaultValue={plan.features.join("\n")} /></label>
      <label className="flex min-h-12 items-center gap-3"><input type="checkbox" name="visits" className="size-5" defaultChecked={plan.includesVisits} /><span>In-person visits are included</span></label>
      <label className="flex min-h-12 items-center gap-3"><input type="checkbox" name="priority" className="size-5" defaultChecked={plan.priorityResponse} /><span>Priority in the coordinator queue</span></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>Save {plan.name}</button>
      <Status s={state} />
    </form>
  );
}
