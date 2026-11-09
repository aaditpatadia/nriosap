import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteBreakdown } from "@/components/QuoteBreakdown";
import { AssignForm, EvidenceForm, FinalReportForm, QuoteForm, StatusForm, UpdateForm } from "@/components/RequestStaffForms";
import { StageBar } from "@/components/StageBar";
import { requireStaff } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/format";
import { STATUS_META } from "@/lib/request-engine";
import { getRequest, quotesForRequest, requestAttachments, requestEvents } from "@/lib/service-requests";
import { getFamily, listCoordinators, logAudit } from "@/lib/store";

export const metadata = { title: "Request" };

export default async function OpsRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireStaff();
  const r = await getRequest(id);
  if (!r) notFound();
  const [fam, events, files, quotes, coordinators] = await Promise.all([getFamily(r.familyId), requestEvents(id), requestAttachments(id), quotesForRequest(id), viewer.role === "admin" ? listCoordinators() : Promise.resolve([]), logAudit(viewer.id, "view_request", "service_request", id, r.familyId)]);
  if (!fam) notFound();
  const u = r.understanding;
  return (
    <section className="grid gap-5">
      <Link className="btn btn-ghost w-fit" href="/ops/requests">Back to requests</Link>
      <header className="grid gap-1">
        <p className="text-[length:var(--text-small)] font-semibold text-muted">{r.ref} · {fam.name} · {r.category}</p>
        <h1 className="text-[length:var(--text-h1)] font-bold [overflow-wrap:anywhere]">{r.title}</h1>
        <div className="flex flex-wrap gap-2"><span className="chip" data-tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</span>{r.priority === "urgent" && <span className="chip" data-tone="danger">Urgent</span>}</div>
      </header>
      {r.needsProfessional && <p className="card" style={{ borderColor: "var(--warn)" }}>This needs a licensed professional. Do not advise. Use the desk task to send it to one.</p>}
      <div className="card"><StageBar status={r.status} /></div>
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-4">
          <div className="card grid gap-2">
            <h2 className="text-[length:var(--text-h3)] font-semibold">The request</h2>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{r.description}</p>
            <p className="text-muted">{r.location ?? "Location not given"}{r.providerName ? ` · Provider: ${r.providerName}` : ""}{r.estimatedCompletion ? ` · By ${fmtDate(r.estimatedCompletion)}` : ""}</p>
            {u.missing && u.missing.length > 0 && <p className="text-[length:var(--text-small)] text-muted">Still to find out: {u.missing.join(" ")}</p>}
            {r.taskId && <Link className="btn btn-secondary w-fit" href={`/ops/task/${r.taskId}`}>Open desk task and timer</Link>}
          </div>
          <StatusForm requestId={id} current={r.status} />
          <AssignForm requestId={id} providerName={r.providerName ?? ""} estimatedCompletion={r.estimatedCompletion ?? ""} coordinators={coordinators.map((c) => ({ id: c.id, name: c.name }))} />
          <QuoteForm requestId={id} providerName={r.providerName ?? ""} />
          {quotes.length > 0 && <div className="card grid gap-3"><h2 className="text-[length:var(--text-h3)] font-semibold">Quotations</h2>{quotes.map((q) => <div key={q.id} className="grid gap-1 border-t border-line pt-2"><QuoteBreakdown quote={q} />{q.changeNote && <p className="text-warn">Customer asked: {q.changeNote}</p>}</div>)}</div>}
        </div>
        <div className="grid gap-4">
          <UpdateForm requestId={id} />
          <EvidenceForm requestId={id} familyId={r.familyId} />
          {files.length > 0 && (
            <div className="card grid gap-2">
              <h2 className="text-[length:var(--text-h3)] font-semibold">Files</h2>
              <ul className="grid gap-2">{files.map((f) => <li key={f.id} className="flex flex-wrap items-center justify-between gap-2"><span className="[overflow-wrap:anywhere]"><span className="chip mr-2">{f.kind === "evidence" ? "Proof" : "From customer"}</span>{f.caption || f.title || "Not available to you"}</span>{f.title && <a className="btn btn-secondary" href={`/api/documents/${f.documentId}/file`} target="_blank" rel="noreferrer" aria-label={`Open ${f.title}`}>Open</a>}</li>)}</ul>
            </div>
          )}
          <FinalReportForm requestId={id} report={r.finalReport ?? ""} />
          <div className="card grid gap-3">
            <h2 className="text-[length:var(--text-h3)] font-semibold">Timeline</h2>
            <ol className="timeline grid gap-4">
              {events.map((e) => <li key={e.id}><p className="[overflow-wrap:anywhere]">{!e.customerVisible && <span className="chip mr-2">Internal</span>}{e.body}</p><p className="text-[length:var(--text-micro)] text-muted">{e.actorName} · {fmtDate(e.at)}, {fmtTime(e.at)}</p></li>)}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
