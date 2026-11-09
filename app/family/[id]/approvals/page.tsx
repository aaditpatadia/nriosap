import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalCard } from "@/components/ApprovalCard";
import { QuoteBreakdown } from "@/components/QuoteBreakdown";
import { getViewer } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { quotesForFamily } from "@/lib/service-requests";
import { approvalsFor, documentsFor, getFamily } from "@/lib/store";

export const metadata = { title: "Payments & Approvals" };

export default async function Approvals({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [docs, list, viewer, quotes] = await Promise.all([documentsFor(id), approvalsFor(id), getViewer(), quotesForFamily(id)]);
  const quoted = new Set(quotes.map((q) => q.approvalId));
  const pendingQuotes = quotes.filter((q) => q.status === "sent");
  const history = quotes.filter((q) => q.status !== "sent");
  const others = list.filter((a) => !quoted.has(a.id));
  const canDecide = viewer?.id === fam.owner.id;
  const toView = (a: (typeof list)[number]) => ({ id: a.id, summary: a.summary, amountInr: a.amountInr, payee: a.payee, feesInr: a.feesInr, when: a.when, status: a.status, undoUntil: a.undoUntil, evidence: a.evidenceIds.map((e) => docs.find((d) => d.id === e)?.title ?? e) });
  return (
    <section className="grid gap-5">
      <h1 className="text-[length:var(--text-h1)] font-extrabold">Payments &amp; Approvals</h1>
      <p className="text-muted">Nothing is paid, sent or filed until you say yes. After you decide, you have 5 minutes to undo.</p>
      <p className="card"><span className="chip mr-2" data-tone="warn">Payment setup</span>Online payment is not connected yet. Approving agrees the work and the price. A person completes each payment after you approve, and Ally never holds your money.</p>
      {list.length === 0 && <p className="text-muted">Nothing is waiting for you.</p>}
      {pendingQuotes.map((q) => {
        const a = list.find((x) => x.id === q.approvalId);
        return (
          <div key={q.id} className="card grid gap-3">
            <Link className="font-semibold text-accent" href={`/family/${id}/requests/${q.requestId}`}>{q.requestRef}: {q.requestTitle}</Link>
            <QuoteBreakdown quote={q} />
            {a && <ApprovalCard canDecide={canDecide} approval={toView(a)} />}
          </div>
        );
      })}
      {others.map((a) => <ApprovalCard key={a.id} canDecide={canDecide} approval={toView(a)} />)}
      {history.length > 0 && (
        <div className="grid gap-3">
          <h2 className="text-[length:var(--text-h2)] font-bold">Approval history</h2>
          <ul className="grid gap-3 xl:grid-cols-2">
            {history.map((q) => <li key={q.id} className="card grid gap-2"><Link className="font-semibold text-accent" href={`/family/${id}/requests/${q.requestId}`}>{q.requestRef}: {q.requestTitle}</Link><span className="text-[length:var(--text-small)] text-muted">{fmtDate(q.createdAt)}</span><QuoteBreakdown quote={q} /></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
