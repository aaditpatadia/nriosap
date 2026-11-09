"use client";

import { useActionState } from "react";
import { ownerConsentAction } from "@/app/actions";
import type { Purpose } from "@/lib/upload-rules";

export function OwnerConsentForm({ familyId, items }: { familyId: string; items: { purpose: Purpose; text: string }[] }) {
  const [s, action, pending] = useActionState(ownerConsentAction, null);
  return (
    <form action={action} className="card grid gap-3" style={{ borderColor: "var(--warn)" }}>
      <h2 className="text-[length:var(--text-h3)] font-semibold">Please confirm your consent</h2>
      <input type="hidden" name="familyId" value={familyId} />
      {items.map((i) => (
        <label key={i.purpose} className="flex items-start gap-3">
          <input type="checkbox" name="purpose" value={i.purpose} className="mt-1 size-6 shrink-0" />
          <span>{i.text}</span>
        </label>
      ))}
      <button className="btn btn-primary" disabled={pending}>Confirm</button>
      <p role="status" aria-live="polite" className={s?.ok ? "text-ok" : "text-danger"}>{s?.message}</p>
    </form>
  );
}
