import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalCard } from "@/components/ApprovalCard";
import { QuoteBreakdown } from "@/components/QuoteBreakdown";
import { CancelRequestButton, DisputeForm, QuoteChangesForm, ReplyForm } from "@/components/RequestActions";
import { StageBar } from "@/components/StageBar";
import { PaymentList } from "@/components/PaymentPanel";
import { paymentsForRequest } from "@/lib/payment-records";
import { Facts, Panel } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/format";
import { isOpenStatus, STATUS_META } from "@/lib/request-engine";
import { familyAccess, getRequest, propertiesFor, quotesForRequest, requestAttachments, requestEvents, type RequestAttachment } from "@/lib/service-requests";
import { approvalsFor, getFamily } from "@/lib/store";

export const metadata = { title: "Request" };

function FileList({ items }: { items: RequestAttachment[] }) {
  return (
    <ul className="rows">
      {items.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="text-[length:var(--text-small)] [overflow-wrap:anywhere]">{f.caption || f.title || "Document"}</span>
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
  const [events, files, quotes, access, approvals, properties, fam, payments] = await Promise.all([requestEvents(requestId), requestAttachments(requestId), quotesForRequest(requestId), familyAccess(id), approvalsFor(id), propertiesFor(id), getFamily(id), paymentsForRequest(requestId)]);
  const s = STATUS_META[r.status];
  const quote = quotes[0];
  const approval = quote?.approvalId ? approvals.find((a) => a.id === quote.approvalId) : undefined;
  const evidence = files.filter((f) => f.kind === "evidence");
  const given = files.filter((f) => f.kind === "customer");
  const open = isOpenStatus(r.status);
  const property = properties.find((p) => p.id === r.propertyId);
  const messages = events.filter((e) => e.kind === "message" || e.kind === "update");
  const history = events.filter((e) => e.kind !== "message" && e.kind !== "update");
  return (
    <section className="grid gap-5">
      <Link className="btn btn-ghost w-fit px-0" href={`/family/${id}/requests`}>Back to My Requests</Link>
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[length:var(--text-small)] font-semibold text-muted">{r.ref} · {r.category}</span>
          <span className="chip" data-tone={s.tone}>{s.label}</span>
          {r.priority === "urgent" && <span className="chip" data-tone="danger">Urgent</span>}
        </div>
        <h1 className="text-[length:var(--text-h1)] font-bold [overflow-wrap:anywhere]">{r.title}</h1>
      </header>
      <div className="card"><StageBar status={r.status} /></div>
      {r.needsProfessional && <p className="card text-[length:var(--text-small)]" style={{ borderColor: "var(--warn)" }}>Part of this needs a licensed professional. We prepare the papers and connect you. The advice is theirs, and we label it that way.</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="grid gap-5">
          <Panel title="What you asked for">
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{r.description}</p>
            {given.length > 0 && <FileList items={given} />}
          </Panel>
          {(messages.length > 0 || (open && access.canCreate)) && (
            <Panel title="Work updates and messages">
              {messages.length > 0 && <ol className="timeline grid gap-4">{messages.map((e) => <li key={e.id}><p className="text-[length:var(--text-small)] [overflow-wrap:anywhere]">{e.body}</p><p className="text-[length:var(--text-micro)] text-muted">{e.actorName} · {fmtDate(e.at)}, {fmtTime(e.at)} India time</p></li>)}</ol>}
            </Panel>
          )}
          {open && access.canCreate && <div id="message"><ReplyForm requestId={requestId} /></div>}
          {(evidence.length > 0 || r.finalReport) && (
            <Panel title="Proof and completion report">
              {r.finalReport && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{r.finalReport}</p>}
              {evidence.length > 0 && <FileList items={evidence} />}
            </Panel>
          )}
          <Panel title="Timeline">
            <ol className="timeline grid gap-4">{history.map((e) => <li key={e.id}><p className="text-[length:var(--text-small)] [overflow-wrap:anywhere]">{e.body}</p><p className="text-[length:var(--text-micro)] text-muted">{e.actorName} · {fmtDate(e.at)}, {fmtTime(e.at)} India time</p></li>)}</ol>
          </Panel>
        </div>

        <aside className="grid gap-5" aria-label="Request details">
          <Panel title="Where this stands">
            <Facts items={[["Who has it now", s.who === "Your coordinator" && r.coordinatorName ? r.coordinatorName : s.who], ["Requested for", r.dueOn ? fmtDate(r.dueOn) : null], ["Expected by", r.estimatedCompletion ? fmtDate(r.estimatedCompletion) : null], ["Where", r.location], ["Provider", r.providerName], ["Created", fmtDate(r.createdAt)], ["Customer", fam?.owner.name]]} />
            <p className="text-[length:var(--text-small)] font-medium">{s.next}</p>
            {property && <Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`/family/${id}/properties/${property.id}`}>{property.name}</Link>}
          </Panel>
          {quote && (
            <Panel title="Quotation">
              <QuoteBreakdown quote={quote} />
              {quote.status === "changes_requested" && <p className="chip w-fit whitespace-normal" data-tone="warn">You asked for changes: {quote.changeNote}</p>}
              {approval && <ApprovalCard canDecide={access.owner} approval={{ id: approval.id, summary: approval.summary, amountInr: approval.amountInr, payee: approval.payee, feesInr: approval.feesInr, when: approval.when, status: approval.status, undoUntil: approval.undoUntil, evidence: [] }} />}
              {quote.status === "sent" && access.owner && <QuoteChangesForm quoteId={quote.id} familyId={id} />}
              {quote.documentId && <a className="btn btn-ghost w-fit px-0" href={`/api/documents/${quote.documentId}/file`} target="_blank" rel="noreferrer">See the supporting quotation</a>}
              <PaymentList payments={payments} />
              <p className="text-[length:var(--text-micro)] text-muted">Approving agrees the work and the price. Ally does not hold your money. You pay the provider directly, and nothing is shown as paid until a receipt or payment reference confirms it.</p>
            </Panel>
          )}
          {access.owner && (
            <div className="flex flex-wrap gap-2">
              {open && <CancelRequestButton requestId={requestId} />}
              {r.status !== "cancelled" && r.status !== "disputed" && <DisputeForm requestId={requestId} />}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
