import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalCard } from "@/components/ApprovalCard";
import { QuoteBreakdown } from "@/components/QuoteBreakdown";
import { CancelRequestButton, DisputeForm, QuoteChangesForm, ReplyForm } from "@/components/RequestActions";
import { StageBar } from "@/components/StageBar";
import { fmtDate, fmtTime } from "@/lib/format";
import { isOpenStatus, STATUS_META } from "@/lib/request-engine";
import { familyAccess, getRequest, quotesForRequest, requestAttachments, requestEvents, type RequestAttachment } from "@/lib/service-requests";
import { approvalsFor } from "@/lib/store";

export const metadata = { title: "Request" };

function FileList({ items }: { items: RequestAttachment[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="[overflow-wrap:anywhere]">{f.caption || f.title || "Document"}</span>
          {f.title && <a className="btn btn-secondary" href={`/api/documents/${f.documentId}/file`} target="_blank" rel="noreferrer" aria-label={`Open ${f.title}`}>Open</a>}
        </li>
      ))}
    </ul>
  );
}

export default async function RequestDetail({ params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id, requestId } = await params;
  const r = await getRequest(requestId);
  if (!r || r.familyId !== id) notFound();
  const [events, files, quotes, access, approvals] = await Promise.all([requestEvents(requestId), requestAttachments(requestId), quotesForRequest(requestId), familyAccess(id), approvalsFor(id)]);
  const s = STATUS_META[r.status];
  const quote = quotes[0];
  const approval = quote?.approvalId ? approvals.find((a) => a.id === quote.approvalId) : undefined;
  const evidence = files.filter((f) => f.kind === "evidence");
  const given = files.filter((f) => f.kind === "customer");
  const open = isOpenStatus(r.status);
  return (
    <section className="grid gap-6">
      <Link className="btn btn-ghost w-fit" href={`/family/${id}/requests`}>Back to My Requests</Link>
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[length:var(--text-small)] font-semibold text-muted">{r.ref} · {r.category}</span>
          <span className="chip" data-tone={s.tone}>{s.label}</span>
          {r.priority === "urgent" && <span className="chip" data-tone="danger">Urgent</span>}
        </div>
        <h1 className="text-[length:var(--text-h1)] font-extrabold [overflow-wrap:anywhere]">{r.title}</h1>
      </header>

      <div className="card grid gap-4">
        <StageBar status={r.status} />
        <dl className="grid gap-3 md:grid-cols-3">
          <div><dt className="text-[length:var(--text-small)] text-muted">Who has it now</dt><dd className="font-semibold">{s.who === "Your coordinator" && r.coordinatorName ? r.coordinatorName : s.who}</dd></div>
          <div className="md:col-span-2"><dt className="text-[length:var(--text-small)] text-muted">What happens next</dt><dd className="font-semibold">{s.next}</dd></div>
          {r.providerName && <div><dt className="text-[length:var(--text-small)] text-muted">Provider</dt><dd>{r.providerName}</dd></div>}
          {r.location && <div><dt className="text-[length:var(--text-small)] text-muted">Where</dt><dd>{r.location}</dd></div>}
          {r.estimatedCompletion && <div><dt className="text-[length:var(--text-small)] text-muted">Expected by</dt><dd>{fmtDate(r.estimatedCompletion)}</dd></div>}
        </dl>
      </div>

      {r.needsProfessional && <p className="card" style={{ borderColor: "var(--warn)" }}>Part of this needs a licensed professional. We prepare the papers and connect you. The advice is theirs, and we label it that way.</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid gap-4">
          <div className="card grid gap-2">
            <h2 className="text-[length:var(--text-h3)] font-semibold">What you asked for</h2>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{r.description}</p>
            {given.length > 0 && <FileList items={given} />}
          </div>

          {quote && (
            <div className="card grid gap-3">
              <h2 className="text-[length:var(--text-h3)] font-semibold">Quotation</h2>
              <QuoteBreakdown quote={quote} />
              {quote.status === "changes_requested" && <p className="chip w-fit whitespace-normal" data-tone="warn">You asked for changes: {quote.changeNote}</p>}
              {approval && (
                <ApprovalCard canDecide={access.owner} approval={{ id: approval.id, summary: approval.summary, amountInr: approval.amountInr, payee: approval.payee, feesInr: approval.feesInr, when: approval.when, status: approval.status, undoUntil: approval.undoUntil, evidence: [] }} />
              )}
              {quote.status === "sent" && access.owner && <QuoteChangesForm quoteId={quote.id} familyId={id} />}
              <p className="text-[length:var(--text-micro)] text-muted">Approving agrees the work and the price. Ally does not hold your money. Online payment is not set up yet, so your coordinator will tell you how this is paid, and nothing is marked paid until it is.</p>
            </div>
          )}

          {(evidence.length > 0 || r.finalReport) && (
            <div className="card grid gap-3">
              <h2 className="text-[length:var(--text-h3)] font-semibold">Proof and report</h2>
              {r.finalReport && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{r.finalReport}</p>}
              {evidence.length > 0 && <FileList items={evidence} />}
            </div>
          )}

          {open && access.canCreate && <ReplyForm requestId={requestId} />}
          {access.owner && (
            <div className="flex flex-wrap gap-3">
              {open && <CancelRequestButton requestId={requestId} />}
              {r.status !== "cancelled" && r.status !== "disputed" && <DisputeForm requestId={requestId} />}
            </div>
          )}
        </div>

        <div className="card grid gap-3">
          <h2 className="text-[length:var(--text-h3)] font-semibold">Timeline</h2>
          <ol className="timeline grid gap-4">
            {events.map((e) => (
              <li key={e.id}>
                <p className="[overflow-wrap:anywhere]">{e.body}</p>
                <p className="text-[length:var(--text-micro)] text-muted">{e.actorName} · {fmtDate(e.at)}, {fmtTime(e.at)} India time</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
