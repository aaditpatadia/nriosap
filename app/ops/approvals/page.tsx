export const dynamic = "force-dynamic";

import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { fmtDate, inr } from "@/lib/format";
import { allQuotes } from "@/lib/ops-console";

export const metadata = { title: "Approvals" };
const LABEL: Record<string, { t: string; tone?: "ok" | "warn" | "danger" }> = { sent: { t: "Waiting for the customer", tone: "warn" }, approved: { t: "Approved, payment not confirmed", tone: "ok" }, rejected: { t: "Rejected", tone: "danger" }, changes_requested: { t: "Changes requested", tone: "warn" }, superseded: { t: "Replaced" } };

export default async function OpsApprovals() {
  await requireStaff();
  const list = await allQuotes();
  return (
    <section className="grid gap-4">
      <PageHeader title="Approvals" sub="Only the customer can decide a quotation. Staff can send, revise and follow up." />
      {list.length === 0 ? <Empty title="No quotations yet." /> : (
        <ul className="card rows p-0">{list.map((q) => <li key={q.id}><Link className="grid gap-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4" href={`/ops/requests/${q.requestId}`}><span className="min-w-0"><span className="block font-semibold [overflow-wrap:anywhere]">{q.ref}: {q.title}</span><span className="block text-[length:var(--text-small)] text-muted">{q.familyName} · {inr(q.totalInr)} · {fmtDate(q.at)}{q.deadline ? ` · decide by ${fmtDate(q.deadline)}` : ""}</span></span><span className="chip w-fit" data-tone={LABEL[q.status]?.tone}>{LABEL[q.status]?.t ?? q.status}</span></Link></li>)}</ul>
      )}
    </section>
  );
}
