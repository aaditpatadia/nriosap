"use client";

import { useActionState } from "react";
import { DetailsFields } from "./DetailsFields";
import { detailsAction } from "@/app/family/platform-actions";
import { Panel } from "./ui";
import { missingDetails, SIZE_LABEL, SERVICE_LABEL, URGENCY_LABEL, type RequestDetails } from "@/lib/pricing-rules";

const line = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(", ");

/** What we know about where and when, what we still need, and a way to add it. Shown to the customer on their request. */
export function DetailsPanel({ requestId, details, canEdit, area, desk = false }: { requestId: string; details: RequestDetails; canEdit: boolean; area: { from: number; to: number }; desk?: boolean }) {
  const [state, action, pending] = useActionState(detailsAction, null);
  const ask = missingDetails(details, { areaPinFrom: area.from, areaPinTo: area.to });
  const d = details;
  const rows: [string, string][] = [
    ["How soon", URGENCY_LABEL[d.urgency]],
    ["What we do", SERVICE_LABEL[d.service]],
    [d.service === "delivery" ? "Pick up from" : "Go to", line(d.pickup.address, d.pickup.area, d.pickup.pincode)],
    ...(d.service === "delivery" ? ([["Drop at", line(d.drop.address, d.drop.area, d.drop.pincode)]] as [string, string][]) : []),
    ["When", line(d.window.date, d.window.from && d.window.to && `${d.window.from} to ${d.window.to}`)],
    ["Time at the place", d.workMinutes ? `About ${d.workMinutes} minutes` : ""],
    ["Carrying", d.item.what ? line(d.item.what, SIZE_LABEL[d.item.size].toLowerCase(), d.item.weightKg ? `${d.item.weightKg} kg` : undefined, d.item.fragile && "fragile") : ""],
  ];
  const shown = rows.filter(([, v]) => v);
  return (
    <Panel title={desk ? "Where and when (the customer's details)" : "Where and when"}>
      {shown.length > 0 && (
        <dl className="grid gap-1 text-[length:var(--text-small)]">
          {shown.map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right [overflow-wrap:anywhere]">{v}</dd></div>)}
        </dl>
      )}
      {ask.length > 0 && canEdit && (
        <div className="grid gap-1 rounded-xl p-3" style={{ background: "var(--warn-bg)" }}>
          <p className="font-semibold">{desk ? "Still to fill in or ask the customer for:" : "To give you an exact price, we still need:"}</p>
          <ul className="list-disc pl-5 text-[length:var(--text-small)]">{ask.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
      {canEdit && (
        <form action={action} className="grid gap-3">
          <input type="hidden" name="requestId" value={requestId} />
          <DetailsFields initial={details} area={area} defaultOpen={ask.length > 0} />
          <button className="btn btn-secondary w-fit" disabled={pending}>{pending ? "Saving..." : "Save these details"}</button>
          <p role="status" aria-live="polite" className={state?.ok ? "text-ok" : "text-danger"}>{state?.message}</p>
        </form>
      )}
    </Panel>
  );
}
