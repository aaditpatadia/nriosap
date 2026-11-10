export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/Timeline";
import { Facts, PageHeader, Panel } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { membersFor, preferencesFor } from "@/lib/family-members";
import { fmtDate } from "@/lib/format";
import { loadPlans } from "@/lib/plans";
import { planForPrice } from "@/lib/plan-rules";
import { STATUS_META } from "@/lib/request-engine";
import { propertiesFor, requestsFor } from "@/lib/service-requests";
import { documentsFor, getCoordinator, getFamily, logAudit, messagesFor, timeline } from "@/lib/store";

export const metadata = { title: "Family" };

export default async function OpsFamily({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireStaff();
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [members, properties, docs, requests, events, prefs, plans, messages, coord] = await Promise.all([membersFor(id), propertiesFor(id), documentsFor(id), requestsFor(id), timeline(id), preferencesFor(fam.owner.id), loadPlans(), messagesFor(id), getCoordinator(fam.coordinatorId), logAudit(viewer.id, "view_family", "family", id, id)]);
  return (
    <section className="grid gap-5">
      <Link className="btn btn-ghost w-fit px-0" href="/ops/families">Back to families</Link>
      <PageHeader title={fam.name}><Link className="btn btn-secondary" href={`/ops/messages/${id}`}>Messages</Link><Link className="btn btn-secondary" href={`/ops/consent/${id}`}>Consent</Link><Link className="btn btn-secondary" href={`/family/${id}`}>Customer view</Link></PageHeader>
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
        <aside className="grid gap-5" aria-label="Customer">
          <Panel title="Customer"><Facts items={[["Name", fam.owner.name], ["Lives in", prefs.country], ["Time zone", prefs.timezone], ["Language", prefs.language], ["Reaches us by", prefs.channel], ["Cities in India", prefs.indiaCities.join(", ")], ["Plan", `${planForPrice(fam.planUsd, plans).name}, $${fam.planUsd} a month`], ["Started", fmtDate(fam.startedAt)], ["Coordinator", coord?.name ?? "Not assigned"]]} /></Panel>
          {!fam.parent.isSelf && <Panel title="Person in India"><Facts items={[["Name", fam.parent.name], ["City", fam.parent.city], ["Language", fam.parent.language], ["Consent", fam.parent.consentStatus]]} /></Panel>}
          <Panel title="Connected family and permissions">{members.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">Nobody connected.</p> : <ul className="rows">{members.map((m) => <li key={m.id} className="grid py-2 text-[length:var(--text-small)]"><span className="font-medium">{m.name} <span className="font-normal text-muted">({m.status})</span></span><span className="text-muted">{m.permissions.join(", ").replaceAll("_", " ") || "No permissions"}</span></li>)}</ul>}</Panel>
          <Panel title="Properties">{properties.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">None added.</p> : <ul className="rows">{properties.map((p) => <li key={p.id} className="py-2 text-[length:var(--text-small)]">{p.name}{p.city ? `, ${p.city}` : ""}</li>)}</ul>}</Panel>
        </aside>
        <div className="grid gap-5">
          <Panel title={`Requests (${requests.length})`}>{requests.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">No requests.</p> : <ul className="rows">{requests.slice(0, 15).map((r) => <li key={r.id}><Link className="row-link" href={`/ops/requests/${r.id}`}><span className="min-w-0 font-medium [overflow-wrap:anywhere]">{r.ref}: {r.title}</span><span className="chip shrink-0" data-tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</span></Link></li>)}</ul>}</Panel>
          <Panel title={`Documents you can see (${docs.length})`}>{docs.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">None.</p> : <ul className="rows">{docs.slice(0, 15).map((d) => <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-[length:var(--text-small)]"><span className="[overflow-wrap:anywhere]">{d.title}</span><Link className="btn btn-ghost" href={`/ops/documents/${d.id}`} aria-label={`Review ${d.title}`}>Review</Link></li>)}</ul>}</Panel>
          <Panel title="Communication history">{messages.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">No messages.</p> : <ul className="rows">{messages.slice(-10).reverse().map((m) => <li key={m.id} className="py-2 text-[length:var(--text-small)] [overflow-wrap:anywhere]"><span className="chip mr-2">{m.direction === "in" ? "Received" : "Sent"}</span>{m.body}</li>)}</ul>}</Panel>
          <Panel title="Activity"><Timeline events={events.slice(0, 15)} /></Panel>
        </div>
      </div>
    </section>
  );
}
