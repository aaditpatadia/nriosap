"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { AnimatePresence, m } from "motion/react";
import { decideAction, undoAction } from "@/app/actions";
import { spring } from "@/lib/motion";
import { inr } from "@/lib/format";
import { Burst } from "./Burst";
import { toast } from "./Toaster";
import type { Approval } from "@/lib/types";

type View = Pick<Approval, "id" | "summary" | "amountInr" | "payee" | "feesInr" | "when" | "status"> & {
  evidence: string[];
  undoUntil?: string;
};

export function ApprovalCard({ approval, canDecide = true }: { approval: View; canDecide?: boolean }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useOptimistic<Approval["status"], Approval["status"]>(approval.status, (_s, n) => n);
  const [undoUntil, setUndoUntil] = useState<string | undefined>(approval.undoUntil);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!undoUntil) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [undoUntil]);
  const leftMs = undoUntil ? new Date(undoUntil).getTime() - now : 0;
  const leftMin = Math.max(1, Math.ceil(leftMs / 60_000));

  function decide(next: "approved" | "declined") {
    setError(null);
    start(async () => {
      setStatus(next);
      const r = await decideAction(approval.id, next);
      if (!r.ok) setError("That did not save. Nothing was changed. Please try again.");
      else { setUndoUntil(r.undoUntil); toast(next === "approved" ? "Approved. You have 5 minutes to undo." : "Rejected. Your coordinator will be told."); }
    });
  }

  function undo() {
    setError(null);
    start(async () => {
      setStatus("pending");
      const r = await undoAction(approval.id);
      if (!r.ok) setError("The undo window has passed.");
      else setUndoUntil(undefined);
    });
  }

  return (
    <m.article layout="position" transition={spring.calm} className="rounded-[10px] border border-line p-4" aria-labelledby={`ap-${approval.id}`}>
      <h2 id={`ap-${approval.id}`} className="text-[length:var(--text-h3)] font-semibold">{approval.summary}</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[length:var(--text-small)]">
        <dt className="text-muted">Who</dt><dd>{approval.payee}</dd>
        <dt className="text-muted">How much</dt><dd>{approval.amountInr ? inr(approval.amountInr) : "No payment"}</dd>
        <dt className="text-muted">Fees</dt><dd>{approval.feesInr ? inr(approval.feesInr) : "None"}</dd>
        <dt className="text-muted">When</dt><dd>{approval.when}</dd>
        <dt className="text-muted">Evidence</dt><dd>{approval.evidence.join(", ") || "None attached"}</dd>
      </dl>
      <p className="mt-3 text-[length:var(--text-micro)] text-muted">
        Checked by your coordinator. Nothing is sent or paid until you approve.
      </p>

      <div className="mt-4 min-h-14" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {!canDecide && status === "pending" ? (
            <p key="wait" className="text-muted">Waiting for the family owner. Only they can decide.</p>
          ) : status === "pending" ? (
            <m.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" disabled={pending} onClick={() => decide("approved")}>
                {approval.amountInr ? "Approve payment" : "Approve action"}
              </button>
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => decide("declined")}>
                Reject
              </button>
            </m.div>
          ) : (
            <m.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring.gentle} className="relative flex flex-wrap items-center gap-3">
              {status === "approved" && <Burst />}
              <span className="chip" data-tone={status === "approved" ? "ok" : "warn"}>
                {status === "approved" ? "Approved" : "Rejected"}
              </span>
              {canDecide && leftMs > 0 && (
                <button type="button" className="btn btn-ghost" disabled={pending} onClick={undo}>
                  Undo ({leftMin} min left)
                </button>
              )}
            </m.div>
          )}
        </AnimatePresence>
        {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
      </div>
    </m.article>
  );
}
