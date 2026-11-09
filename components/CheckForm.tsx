"use client";

import { useActionState } from "react";
import { checkDocumentAction } from "@/app/ops/actions";
import { FIELD_LABELS } from "@/lib/extract-labels";
import type { CheckDoc } from "@/lib/vault";

const KINDS = [["policy", "Policy"], ["bill", "Bill"], ["discharge_summary", "Discharge summary"], ["report", "Report"], ["id", "ID"]] as const;

export function CheckForm({ doc }: { doc: CheckDoc }) {
  const [state, action, pending] = useActionState(checkDocumentAction, null);
  const known = new Map(doc.fields.map((f) => [f.label, f]));
  const labels = [...new Set([...doc.fields.map((f) => f.label), ...FIELD_LABELS])];
  return (
    <form action={action} className="card grid gap-4">
      <input type="hidden" name="id" value={doc.id} />
      <label className="field">Type of document
        <select className="input" name="kind" defaultValue={doc.kind}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      {labels.map((label) => {
        const f = known.get(label);
        const low = f && f.confidence < 0.9;
        return (
          <label key={label} className="field">
            <span className="flex flex-wrap items-center gap-2">{label}
              {f && <span className="chip" data-tone={low ? "warn" : "ok"}>{low ? "Check this: " : ""}{Math.round(f.confidence * 100)}%</span>}
            </span>
            <input className="input" name={`f:${label}`} defaultValue={f?.value ?? ""} maxLength={200} />
          </label>
        );
      })}
      <button className="btn btn-primary" disabled={pending}>Confirm these details</button>
      <p role="status" aria-live="polite" className={state?.ok ? "text-ok" : "text-danger"}>{state?.message}</p>
    </form>
  );
}
