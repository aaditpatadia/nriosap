import Link from "next/link";
import { notFound } from "next/navigation";
import { EscalateForm, PriorityToggle } from "@/components/OpsForms";
import { QuoteBreakdown } from "@/components/QuoteBreakdown";
import { AssignForm, EvidenceForm, FinalReportForm, QuoteForm, StatusForm, UpdateForm } from "@/components/RequestStaffForms";
import { StageBar } from "@/components/StageBar";
import { Panel } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/format";
import { partners as allPartners } from "@/lib/ops-console";
import { STATUS_META } from "@/lib/request-engine";
import { getRequest, quotesForRequest, requestAttachments, requestEvents, type RequestEvent } from "@/lib/service-requests";
import { getFamily, listCoordinators, logAudit } from "@/lib/store";

export const metadata = { title: "Request" };

const Feed = ({ items }: { items: RequestEvent[] }) => <ol className="timeline grid gap-4">{items.map((e) => <li key={e.id}><p className="text-[length:var(--text-small)] [overflow-wrap:anywhere]">{e.body}</p><p className="text-[length:var(--text-micro)] text-muted">{e.actorName} · {fmtDate(e.at)}, {fmtTime(e.at)}</p></li>)}</ol>;

export default async function OpsRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireStaff();
  const r = await getRequest(id);
  if (!r) notFound();
  const [fam, events, files, quotes, coordinators, partners] = await Promise.all([getFamily(r.familyId), requestEvents(id), requestAttachments(id), quotesForRequest(id), viewer.role === "admin" ? listCoordinators() : Promise.resolve([]), allPartners(), logAudit(viewer.id, "view_request", "service_request", id, r.familyId)]);
  if (!fam) notFound();
  const u = r.understanding;
  const internal = events.filter((e) => !e.customerVisible);
  const visible = events.filter((e) => e.customerVisible);
  return (
    <section className="grid gap-5">
      <Link className="btn btn-ghost w-fit px-0" href="/ops/requests">Back to requests</Link>
      <header className="grid gap-2">
        <p className="text-[length:var(--text-small)] font-semibold text-muted">{r.ref} · <Link className="text-accent" href={`/ops/families/${r.familyId}`}>{fam.name}</Link> · {r.category}</p>
        <h1 className="text-[length:var(--text-h1)] font-bold [overflow-wrap:anywhere]">{r.title}</h1>
        <div className="flex flex-wrap items-center gap-2"><span className="chip" data-tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</span>{r.priority === "urgent" && <span className="chip" data-tone="danger">Urgent</span>}{r.escalatedAt && <span className="chip" data-tone="danger">Escalated</span>}<PriorityToggle requestId={id} urgent={r.priority === "urgent"} /></div>
      </header>
      {r.needsProfessional && <p className="card text-[length:var(--text-small)]" style={{ borderColor: "var(--warn)" }}>This needs a licensed professional. Do not advise. Use the desk task to send it to one.</p>}
      <div className="card"><StageBar status={r.status} /></div>
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <div className="grid gap-4">
          <Panel title="The request">
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{r.description}</p>
            <p className="text-[length:var(--text-small)] text-muted">{r.location ?? "Location not given"}{r.providerName ? ` · Provider: ${r.providerName}` : ""}{r.dueOn ? ` · Needed by ${fmtDate(r.dueOn)}` : ""}{r.estimatedCompletion ? ` · Expected ${fmtDate(r.estimatedCompletion)}` : ""}</p>
            {u.missing && u.missing.length > 0 && <p className="text-[length:var(--text-small)] text-muted">Still to find out: {u.missing.join(" ")}</p>}
            {r.taskId && <Link className="btn btn-secondary w-fit" href={`/ops/task/${r.taskId}`}>Open desk task and timer</Link>}
          </Panel>
          <StatusForm requestId={id} current={r.status} />
          <AssignForm requestId={id} providerName={r.providerName ?? ""} estimatedCompletion={r.estimatedCompletion ?? ""} coordinators={coordinators.map((c) => ({ id: c.id, name: c.name }))} partners={partners.filter((p) => p.status === "approved").map((p) => ({ id: p.id, name: p.name, category: p.category }))} />
          <QuoteForm requestId={id} providerName={r.providerName ?? ""} />
          {quotes.length > 0 && <Panel title="Quotations">{quotes.map((q) => <div key={q.id} className="grid gap-1 border-t border-line pt-2"><QuoteBreakdown quote={q} />{q.changeNote && <p className="text-warn">Customer asked: {q.changeNote}</p>}</div>)}</Panel>}
        </div>
        <div className="grid gap-4">
          <UpdateForm requestId={id} />
          {internal.length > 0 && <div className="card grid gap-3" style={{ background: "var(--warn-bg)" }}><h2 className="section-title">Internal notes. The customer cannot see these.</h2><Feed items={internal} /></div>}
          <EvidenceForm requestId={id} familyId={r.familyId} />
          {files.length > 0 && (
            <Panel title="Files">
              <ul className="rows">{files.map((f) => <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[length:var(--text-small)]"><span className="[overflow-wrap:anywhere]"><span className="chip mr-2">{f.kind === "evidence" ? "Proof" : "From customer"}</span>{f.caption || f.title || "Not available to you"}</span>{f.title && <a className="btn btn-secondary" href={`/api/documents/${f.documentId}/file`} target="_blank" rel="noreferrer" aria-label={`Open ${f.title}`}>Open</a>}</li>)}</ul>
            </Panel>
          )}
          <FinalReportForm requestId={id} report={r.finalReport ?? ""} />
          <EscalateForm requestId={id} />
          <Panel title="Customer-visible timeline"><Feed items={visible} /></Panel>
        </div>
      </div>
    </section>
  );
}
