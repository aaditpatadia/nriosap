"use client";

import { useActionState, useState, useTransition } from "react";
import { cancelRequestAction, disputeAction, quoteChangesAction, replyAction } from "@/app/family/platform-actions";

const Status = ({ s }: { s: { ok: boolean; message: string } | null }) => <p role="status" aria-live="polite" className={s?.ok ? "text-ok" : "text-danger"}>{s?.message}</p>;

export function ReplyForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(replyAction, null);
  return (
    <form action={action} key={state?.ok ? "sent" : "form"} className="card grid gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <label className="field">Message your coordinator<textarea className="input" name="body" rows={2} maxLength={1000} required /></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>Send</button>
      <Status s={state} />
    </form>
  );
}

export function QuoteChangesForm({ quoteId, familyId }: { quoteId: string; familyId: string }) {
  const [state, action, pending] = useActionState(quoteChangesAction, null);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn btn-secondary w-fit" onClick={() => setOpen(true)}>Request changes</button>;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="familyId" value={familyId} />
      <label className="field">What should change?<textarea className="input" name="note" rows={2} maxLength={500} required /></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>Send to my coordinator</button>
      <Status s={state} />
    </form>
  );
}

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  if (!sure) return <button type="button" className="btn btn-secondary" onClick={() => setSure(true)}>Cancel this request</button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-danger">Cancel it?</span>
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => start(async () => { await cancelRequestAction(requestId); setSure(false); })}>Yes, cancel</button>
      <button type="button" className="btn btn-ghost" onClick={() => setSure(false)}>Keep it</button>
    </div>
  );
}

export function DisputeForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(disputeAction, null);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>Report a problem</button>;
  return (
    <form action={action} className="card grid w-full gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <label className="field">What went wrong?<textarea className="input" name="reason" rows={2} maxLength={500} required /></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>Report it</button>
      <Status s={state} />
    </form>
  );
}
