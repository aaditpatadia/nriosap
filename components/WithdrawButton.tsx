"use client";

import { useState, useTransition } from "react";
import { withdrawDocumentAction } from "@/app/family/actions";
import type { Purpose } from "@/lib/upload-rules";

export function WithdrawButton({ documentId, purpose, label, warn }: { documentId: string; purpose: Purpose; label: string; warn?: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  if (warn && confirming) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-danger">{warn}</span>
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => start(async () => { await withdrawDocumentAction(documentId, purpose); })}>Yes, remove it</button>
        <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>Keep it</button>
      </span>
    );
  }
  return <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => (warn ? setConfirming(true) : start(async () => { await withdrawDocumentAction(documentId, purpose); }))}>{label}</button>;
}
