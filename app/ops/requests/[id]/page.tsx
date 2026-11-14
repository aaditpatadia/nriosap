import Link from "next/link";
import { notFound } from "next/navigation";
import { EscalateForm, PriorityToggle } from "@/components/OpsForms";
import { PaymentList } from "@/components/PaymentPanel";
import { RecordPaymentForm, SettlePaymentForm } from "@/components/PaymentForms";
import { paymentsForRequest } from "@/lib/payment-records";
import { QuoteBreakdown } from "@/components/QuoteBreakdown";
import { AssignForm, EvidenceForm, FinalReportForm, StatusForm, UpdateForm } from "@/components/RequestStaffForms";
import { QuoteDesk } from "@/components/QuoteDesk";
import { DetailsPanel } from "@/components/DetailsPanel";
import { activeRateCard, fxRates, ownerCurrency } from "@/lib/pricing";
import { inputFromDetails, SERVICE_LABEL, URGENCY_LABEL } from "@/lib/pricing-rules";
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
  const [fam, events, files, quotes, coordinators, partners, payments] = await Promise.all([getFamily(r.familyId), requestEvents(id), requestAttachments(id), quotesForRequest(id), viewer.role === "admin" ? listCoordinators() : Promise.resolve([]), allPartners(), paymentsForRequest(id), logAudit(viewer.id, "view_request", "service_request", id, r.familyId)]);
  if (!fam) notFound();
  const [rc, fx, currency] = await Promise.all([activeRateCard(), fxRates(), ownerCurrency(r.familyId)]);
  const d = r.details;
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
      {(r.understanding as { via?: string } | null)?.via === "voice" && <p className="card text-[length:var(--text-small)]" style={{ background: "var(--mint)", borderColor: "var(--mint-line)" }}><strong>Voice note request.</strong> Listen to the voice note under Files first. Then fill in the place, time and how long under Where and when below, ask the customer for anything missing, and price it.</p>}
      {r.needsProfessional && <p className="card text-[length:var(--text-small)]" style={{ borderColor: "var(--warn)" }}>This needs a licensed professional. Do not advise. Use the desk task to send it to one.</p>}
      <div className="card"><StageBar status={r.status} /></div>
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <div className="grid gap-4">
          <Panel title="The request">
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{r.description}</p>
            <p className="text-[length:var(--text-small)] text-muted">{r.location ?? "Location not given"}{r.providerName ? ` · Provider: ${r.providerName}` : ""}{r.dueOn ? ` · Needed by ${fmtDate(r.dueOn)}` : ""}{r.estimatedCompletion ? ` · Expected ${fmtDate(r.estimatedCompletion)}` : ""}</p>
            <p className="text-[length:var(--text-small)] text-muted">{SERVICE_LABEL[d.service]} · {URGENCY_LABEL[d.urgency]}{d.window.date ? ` · ${d.window.date}${d.window.from ? ` ${d.window.from}` : ""}` : ""}{d.pickup.pincode ? ` · PIN ${d.pickup.pincode}` : ""}{d.item.what ? ` · ${d.item.what}` : ""}</p>
            {u.missing && u.missing.length > 0 && <p className="text-[length:var(--text-small)] text-muted">Still to find out: {u.missing.join(" ")}</p>}
            {r.taskId && <Link className="btn btn-secondary w-fit" href={`/ops/task/${r.taskId}`}>Open desk task and timer</Link>}
          </Panel>
          <DetailsPanel requestId={id} details={d} canEdit area={{ from: rc.card.areaPinFrom, to: rc.card.areaPinTo }} desk />
          <StatusForm requestId={id} current={r.status} />
          <AssignForm requestId={id} providerName={r.providerName ?? ""} estimatedCompletion={r.estimatedCompletion ?? ""} coordinators={coordinators.map((c) => ({ id: c.id, name: c.name }))} partners={partners.filter((p) => p.status === "approved").map((p) => ({ id: p.id, name: p.name, category: p.category }))} />
          {quotes.length > 0 && <Panel title="Quotations">{quotes.map((q) => <div key={q.id} className="grid gap-1 border-t border-line pt-2"><QuoteBreakdown quote={q} />{q.changeNote && <p className="text-warn">Customer asked: {q.changeNote}</p>}</div>)}</Panel>}
        </div>
        <div className="grid gap-4">
          {quotes.some((q) => q.status === "approved") && <RecordPaymentForm requestId={id} />}
          {payments.length > 0 && <Panel title="Payments"><PaymentList payments={payments} />{payments.filter((p) => p.status === "pending").map((p) => <SettlePaymentForm key={p.id} paymentId={p.id} familyId={r.familyId} />)}</Panel>}
          <UpdateForm requestId={id} />
          {internal.length > 0 && <div className="card grid gap-3" style={{ background: "var(--warn-bg)" }}><h2 className="section-title">Internal notes. The customer cannot see these.</h2><Feed items={internal} /></div>}
          <EvidenceForm requestId={id} familyId={r.familyId} />
          {files.length > 0 && (
            <Panel title="Files">
              <ul className="rows">{files.map((f) => <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[length:var(--text-small)]"><span className="[overflow-wrap:anywhere]"><span className="chip mr-2">{f.kind === "evidence" ? "Proof" : "From customer"}</span>{f.caption || f.title || "Not available to you"}</span>{f.title?.startsWith("Voice note") ? <audio controls preload="none" src={`/api/documents/${f.documentId}/file`} className="w-full sm:w-72" aria-label="The customer's voice note" /> : f.title && <a className="btn btn-secondary" href={`/api/documents/${f.documentId}/file`} target="_blank" rel="noreferrer" aria-label={`Open ${f.title}`}>Open</a>}</li>)}</ul>
            </Panel>
          )}
          <FinalReportForm requestId={id} report={r.finalReport ?? ""} />
          <EscalateForm requestId={id} />
          <Panel title="Customer-visible timeline"><Feed items={visible} /></Panel>
        </div>
      </div>
      <div id="price" className="scroll-mt-4">
        <QuoteDesk
          requestId={id} providerName={r.providerName ?? ""} card={rc.card} version={rc.version} details={d} customerCurrency={currency}
          fx={fx.map((x) => ({ currency: x.currency, perInr: x.perInr, asOf: x.asOf }))}
          preset={{ input: inputFromDetails(d), from: d.pickup.area || d.pickup.address, to: d.service === "delivery" ? d.drop.area || d.drop.address : "" }}
        />
      </div>
    </section>
  );
}
