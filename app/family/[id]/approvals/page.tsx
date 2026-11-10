import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalCard } from "@/components/ApprovalCard";
import { QuoteBreakdown } from "@/components/QuoteBreakdown";
import { QuoteChangesForm } from "@/components/RequestActions";
import { Empty, PageHeader, Panel } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { familyAccess, quotesForFamily } from "@/lib/service-requests";
import { approvalsFor, documentsFor, getFamily } from "@/lib/store";

export const metadata = { title: "Approvals" };

export default async function Approvals({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const access = await familyAccess(id);
  if (!access.owner && !access.staff) notFound();
  const [docs, list, viewer, quotes] = await Promise.all([documentsFor(id), approvalsFor(id), getViewer(), quotesForFamily(id)]);
  const quoted = new Set(quotes.map((q) => q.approvalId));
  const pendingQuotes = quotes.filter((q) => q.status === "sent");
  const history = quotes.filter((q) => q.status !== "sent");
  const others = list.filter((a) => !quoted.has(a.id));
  const canDecide = viewer?.id === fam.owner.id;
  const toView = (a: (typeof list)[number]) => ({ id: a.id, summary: a.summary, amountInr: a.amountInr, payee: a.payee, feesInr: a.feesInr, when: a.when, status: a.status, undoUntil: a.undoUntil, evidence: a.evidenceIds.map((e) => docs.find((d) => d.id === e)?.title ?? e) });
  return (
    <section className="grid gap-5">
      <PageHeader title="Approvals" sub="Nothing is paid, sent or filed until you say yes. After you decide, you have 5 minutes to undo." />
      <p className="card text-[length:var(--text-small)]"><span className="chip mr-2" data-tone="warn">Payment</span>Online payment is not connected. Approving agrees the work and the price. Nothing shows as paid here unless a payment has been confirmed, and Ally never holds your money.</p>
      {list.length === 0 && <Empty title="Nothing is waiting for you.">Quotations from your coordinator appear here for you to review.</Empty>}
      {pendingQuotes.map((q) => {
        const a = list.find((x) => x.id === q.approvalId);
        return (
          <Panel key={q.id} title={`${q.requestRef}: ${q.requestTitle}`} action={<Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`/family/${id}/requests/${q.requestId}`}>Open request</Link>}>
            <QuoteBreakdown quote={q} />
            {q.approvalDeadline && <p className="text-[length:var(--text-small)] font-medium text-warn">Please decide by {fmtDate(q.approvalDeadline)}.</p>}
            {q.documentId && <a className="btn btn-ghost w-fit px-0" href={`/api/documents/${q.documentId}/file`} target="_blank" rel="noreferrer">See the supporting quotation</a>}
            {a && <ApprovalCard canDecide={canDecide} approval={toView(a)} />}
            {canDecide && <div className="flex flex-wrap items-start gap-2"><QuoteChangesForm quoteId={q.id} familyId={id} /><Link className="btn btn-ghost" href={`/family/${id}/requests/${q.requestId}#message`}>Ask a question</Link></div>}
          </Panel>
        );
      })}
      {others.map((a) => <ApprovalCard key={a.id} canDecide={canDecide} approval={toView(a)} />)}
      {history.length > 0 && (
        <div className="grid gap-3">
          <h2 className="section-title">Approval history</h2>
          <ul className="grid gap-3 xl:grid-cols-2">
            {history.map((q) => <li key={q.id} className="card grid gap-2"><Link className="font-semibold text-accent" href={`/family/${id}/requests/${q.requestId}`}>{q.requestRef}: {q.requestTitle}</Link><span className="text-[length:var(--text-small)] text-muted">{fmtDate(q.createdAt)}</span><QuoteBreakdown quote={q} /></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
