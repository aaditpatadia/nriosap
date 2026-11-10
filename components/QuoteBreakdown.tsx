import { fmtDate, inr } from "@/lib/format";
import type { Quotation } from "@/lib/service-requests";

const LABEL: Record<string, { text: string; tone?: "ok" | "warn" | "danger" }> = {
  sent: { text: "Waiting for your decision", tone: "warn" },
  approved: { text: "Approved, payment not completed", tone: "ok" },
  rejected: { text: "Rejected", tone: "danger" },
  changes_requested: { text: "Changes requested", tone: "warn" },
  superseded: { text: "Replaced by a newer quotation" },
};

export function QuoteBreakdown({ quote }: { quote: Quotation }) {
  const s = LABEL[quote.status] ?? { text: quote.status };
  const rows: [string, number][] = [["Provider fee", quote.providerFeeInr], ["Ally service fee", quote.coordinationFeeInr], ["Taxes", quote.taxesInr]];
  return (
    <div className="grid gap-2">
      <span className="chip w-fit" data-tone={s.tone}>{s.text}</span>
      <dl className="grid gap-1">
        {quote.providerName && <div className="flex justify-between gap-3"><dt className="text-muted">Provider</dt><dd>{quote.providerName}</dd></div>}
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="tabular-nums">{inr(v)}</dd></div>)}
        <div className="flex justify-between gap-3 border-t border-line pt-1 font-bold"><dt>Total</dt><dd className="tabular-nums">{inr(quote.totalInr)}</dd></div>
        {quote.estimatedCompletion && <div className="flex justify-between gap-3"><dt className="text-muted">Expected by</dt><dd>{fmtDate(quote.estimatedCompletion)}</dd></div>}
      </dl>
      {quote.notes && <p className="text-[length:var(--text-small)] text-muted [overflow-wrap:anywhere]">{quote.notes}</p>}
    </div>
  );
}
