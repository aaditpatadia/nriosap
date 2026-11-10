import { inr, fmtDate } from "@/lib/format";
import type { PaymentRecord } from "@/lib/payment-records";

const STATUS = { pending: { label: "Payment pending", tone: "warn" }, confirmed: { label: "Payment confirmed", tone: "ok" }, failed: { label: "Payment failed", tone: "danger" } } as const;

/** What the customer sees. "Confirmed" appears only when a receipt or reference was saved. */
export function PaymentList({ payments }: { payments: PaymentRecord[] }) {
  if (payments.length === 0) return null;
  return (
    <ul className="rows">
      {payments.map((p) => (
        <li key={p.id} className="grid gap-2 py-3 text-[length:var(--text-small)]">
          <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{inr(p.amountInr)} to {p.payee}</span><span className="chip" data-tone={STATUS[p.status].tone}>{STATUS[p.status].label}</span></span>
          {p.status === "pending" && p.linkUrl && <a className="btn btn-secondary w-fit" href={p.linkUrl} target="_blank" rel="noopener noreferrer">Pay {p.payee} directly</a>}
          {p.status === "pending" && <span className="text-muted">This opens {p.payee}&apos;s own payment page. Ally does not receive or hold this money.</span>}
          {p.status === "confirmed" && <span className="text-muted">Confirmed {p.confirmedAt ? fmtDate(p.confirmedAt) : ""}{p.reference ? `, reference ${p.reference}` : ""}.</span>}
          {p.receiptDocumentId && <a className="btn btn-ghost w-fit px-0" href={`/api/documents/${p.receiptDocumentId}/file`} target="_blank" rel="noreferrer">See the receipt</a>}
          {p.note && <span className="text-muted [overflow-wrap:anywhere]">{p.note}</span>}
        </li>
      ))}
    </ul>
  );
}
