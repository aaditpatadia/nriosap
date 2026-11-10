"use client";

import { useState, useTransition } from "react";
import { linkCodeAction } from "@/app/family/[id]/settings/whatsapp-actions";

/** Shows a one-time code. Sending it from the owner's phone proves the number, so APPROVE replies from it can count. */
export function WhatsAppLink({ linkedAt, deskNumber }: { linkedAt: string | null; deskNumber: string | null }) {
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      <p className="text-[length:var(--text-small)] text-muted">
        {linkedAt ? "Your WhatsApp number is linked. You can approve a quotation by replying APPROVE and its reference, and undo it within 5 minutes." : "Link your WhatsApp number to approve quotations by replying on WhatsApp. Until then, approvals happen here in the app."}
      </p>
      <button type="button" className="btn btn-secondary w-fit" disabled={pending} onClick={() => start(async () => {
        const r = await linkCodeAction();
        if (r.ok) {
          setCode(r.code);
          setErr("");
        } else setErr(r.reason);
      })}>{linkedAt ? "Link a different number" : "Link my WhatsApp number"}</button>
      {code && <p role="status" aria-live="polite">From your phone, send <strong className="tabular-nums">LINK {code}</strong> to Ally on WhatsApp{deskNumber ? ` (+${deskNumber})` : ""} within 15 minutes. The code works once.</p>}
      {err && <p role="alert" className="text-danger">{err}</p>}
    </div>
  );
}
