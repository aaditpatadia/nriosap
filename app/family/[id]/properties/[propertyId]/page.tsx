import Link from "next/link";
import { notFound } from "next/navigation";
import { EditPropertyForm, PropertyContactToggle, RemovePropertyButton } from "@/components/PropertyForms";
import { Empty, Facts, PageHeader, Panel } from "@/components/ui";
import { membersFor } from "@/lib/family-members";
import { fmtDate, fmtTime, inr } from "@/lib/format";
import { isOpenStatus, STATUS_META } from "@/lib/request-engine";
import { familyAccess, propertiesFor, requestsFor } from "@/lib/service-requests";
import { documentsFor } from "@/lib/store";
import { deadlinesFor, visitsFor } from "@/lib/workspace";
import { daysBetween, istDate, whenWords } from "@/lib/workspace-rules";

export const metadata = { title: "Property" };

export default async function PropertyDetail({ params }: { params: Promise<{ id: string; propertyId: string }> }) {
  const { id, propertyId } = await params;
  const access = await familyAccess(id);
  if (!access.canReadRequests) notFound();
  const property = (await propertiesFor(id)).find((p) => p.id === propertyId);
  if (!property) notFound();
  const [requests, visits, deadlines, docs, members] = await Promise.all([requestsFor(id), visitsFor(id), access.canSeeBills ? deadlinesFor(id) : [], documentsFor(id), access.owner ? membersFor(id) : []]);
  const base = `/family/${id}`;
  const today = istDate(new Date());
  const mine = requests.filter((r) => r.propertyId === propertyId);
  const myVisits = visits.filter((v) => v.propertyId === propertyId);
  const bills = deadlines.filter((d) => d.propertyId === propertyId && d.status === "upcoming");
  const myDocs = docs.filter((d) => d.propertyId === propertyId);
  const canEdit = access.owner || access.staff;
  return (
    <section className="grid gap-5">
      <Link className="btn btn-ghost w-fit px-0" href={`${base}/properties`}>Back to Properties</Link>
      <PageHeader title={property.name} sub={[property.address, property.city].filter(Boolean).join(", ") || undefined}>
        {access.canCreate && <Link className="btn btn-secondary" href={`${base}/requests/new?property=${property.id}&text=${encodeURIComponent(`I need help with ${property.name}${property.city ? ` in ${property.city}` : ""}: `)}`}>Ask for work on this</Link>}
        {access.owner && <RemovePropertyButton id={property.id} name={property.name} />}
      </PageHeader>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="grid gap-5">
          <Panel title="Visits and inspection reports">
            {myVisits.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">No visits recorded. Ask for an inspection and the report will appear here.</p> : (
              <ul className="rows">
                {myVisits.map((v) => (
                  <li key={v.id} className="grid gap-1 py-3">
                    <p className="flex flex-wrap items-center gap-2 font-medium">{v.purpose}<span className="chip" data-tone={v.status === "completed" ? "ok" : undefined}>{v.status === "completed" ? "Report added" : v.status === "scheduled" ? "Scheduled" : "Cancelled"}</span></p>
                    <p className="text-[length:var(--text-small)] text-muted">{fmtDate(v.scheduledAt)}, {fmtTime(v.scheduledAt)} India time{v.coordinatorName ? ` · ${v.coordinatorName}` : ""}</p>
                    {v.notes && <p className="text-[length:var(--text-small)] whitespace-pre-wrap [overflow-wrap:anywhere]">{v.notes}</p>}
                    {v.issues && <p className="text-[length:var(--text-small)] [overflow-wrap:anywhere]"><strong>Issues found:</strong> {v.issues}</p>}
                    {v.nextSteps && <p className="text-[length:var(--text-small)] [overflow-wrap:anywhere]"><strong>Suggested next steps:</strong> {v.nextSteps}</p>}
                    {v.photoIds.length > 0 && <p className="flex flex-wrap items-center gap-1">{v.photoIds.map((pid, i) => <a key={pid} className="btn btn-ghost" href={`/api/documents/${pid}/file`} target="_blank" rel="noreferrer">Photo {i + 1}</a>)}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Requests">
            {mine.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">No requests linked to this property.</p> : <ul className="rows">{mine.map((r) => <li key={r.id}><Link className="row-link" href={`${base}/requests/${r.id}`}><span className="min-w-0 font-medium [overflow-wrap:anywhere]">{r.title}<span className="block text-[length:var(--text-small)] font-normal text-muted">{r.ref}</span></span><span className="chip shrink-0" data-tone={isOpenStatus(r.status) ? STATUS_META[r.status].tone : undefined}>{STATUS_META[r.status].label}</span></Link></li>)}</ul>}
          </Panel>
          {access.canSeeVault && <Panel title="Documents">{myDocs.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">No documents linked yet. Link one from the Vault under Dates and tags.</p> : <ul className="rows">{myDocs.map((d) => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="text-[length:var(--text-small)] font-medium [overflow-wrap:anywhere]">{d.title}</span><a className="btn btn-ghost" href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" aria-label={`Open ${d.title}`}>Open</a></li>)}</ul>}</Panel>}
        </div>
        <aside className="grid gap-5" aria-label="Property details">
          <Panel title="Overview"><Facts items={[["Ownership", property.ownership], ["Tenant", property.tenantName], ["Tenant phone", property.tenantPhone], ["Monthly rent", property.rentInr !== null ? inr(property.rentInr) : null], ["Rent agreement ends", property.leaseEnd ? fmtDate(property.leaseEnd) : null]]} />{!property.ownership && !property.tenantName && !property.rentInr && <Empty title="No details yet." />}{property.notes && <p className="text-[length:var(--text-small)] text-muted [overflow-wrap:anywhere]">{property.notes}</p>}</Panel>
          {access.canSeeBills && <Panel title="Bills and dates" action={<Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`${base}/bills`}>Manage</Link>}>{bills.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">Nothing upcoming.</p> : <ul className="rows">{bills.map((b) => <li key={b.id} className="flex justify-between gap-3 py-2 text-[length:var(--text-small)]"><span className="font-medium [overflow-wrap:anywhere]">{b.title}{b.amountInr !== null ? ` · ${inr(b.amountInr)}` : ""}</span><span className="shrink-0 text-muted">{whenWords(daysBetween(today, b.dueOn))}</span></li>)}</ul>}</Panel>}
          {members.length > 0 && <Panel title="Family contacts"><ul className="rows">{members.map((m) => { const linked = property.contactMemberIds.includes(m.id); return <li key={m.id} className="flex items-center justify-between gap-2 py-1 text-[length:var(--text-small)]"><span>{m.name}{linked ? " (linked)" : ""}</span><PropertyContactToggle propertyId={property.id} memberId={m.id} name={m.name} linked={linked} /></li>; })}</ul></Panel>}
          {canEdit && <Panel title="Edit details"><EditPropertyForm property={property} /></Panel>}
        </aside>
      </div>
    </section>
  );
}
