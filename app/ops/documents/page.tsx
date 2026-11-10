export const dynamic = "force-dynamic";

import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { documentReviewQueue } from "@/lib/ops-console";

export const metadata = { title: "Document Review" };

export default async function DocumentReview() {
  await requireStaff();
  const list = await documentReviewQueue();
  return (
    <section className="grid gap-4">
      <PageHeader title="Document Review" sub="Documents where AI was under 90% sure, or could not read them. Only your assigned families appear here. Opening one is written to the access log." />
      {list.length === 0 ? <Empty title="Nothing waiting for review." /> : (
        <ul className="card rows p-0">{list.map((d) => <li key={d.id}><Link className="flex items-center justify-between gap-3 px-4 py-3" href={`/ops/documents/${d.id}`}><span className="min-w-0"><span className="block font-semibold [overflow-wrap:anywhere]">{d.title}</span><span className="block text-[length:var(--text-small)] text-muted">{d.familyName} · {fmtDate(d.at)}</span></span><span className="chip shrink-0" data-tone="warn">{d.status === "failed" ? "Could not read" : `${Math.round(d.confidence * 100)}% sure`}</span></Link></li>)}</ul>
      )}
    </section>
  );
}
