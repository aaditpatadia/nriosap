import Link from "next/link";
import { notFound } from "next/navigation";
import { AddPropertyForm, RemovePropertyButton } from "@/components/PropertyForms";
import { familyAccess, propertiesFor } from "@/lib/service-requests";

export const metadata = { title: "Properties & Assets" };
const KIND: Record<string, string> = { flat: "Flat", house: "House", plot: "Plot", shop: "Shop", vehicle: "Vehicle", other: "Other" };

export default async function Properties({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await familyAccess(id);
  if (!access.canReadRequests) notFound();
  const list = await propertiesFor(id);
  const canEdit = access.owner || access.staff;
  return (
    <section className="grid gap-6">
      <div>
        <h1 className="text-[length:var(--text-h1)] font-extrabold">Properties &amp; Assets</h1>
        <p className="mt-1 text-muted">Keep track of what you own in India, and ask for work on any of it.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid gap-3">
          {list.length === 0 && <p className="card text-muted">Nothing added yet. Add your first property or vehicle.</p>}
          {list.map((p) => (
            <article key={p.id} className="card grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[length:var(--text-h3)] font-semibold [overflow-wrap:anywhere]">{p.name}</h2>
                <span className="chip">{KIND[p.kind]}</span>
              </div>
              {(p.address || p.city) && <p className="text-muted [overflow-wrap:anywhere]">{[p.address, p.city].filter(Boolean).join(", ")}</p>}
              {p.tenantName && <p>Tenant: {p.tenantName}</p>}
              {p.notes && <p className="text-muted [overflow-wrap:anywhere]">{p.notes}</p>}
              <div className="flex flex-wrap gap-2">
                {access.canCreate && <Link className="btn btn-secondary" href={`/family/${id}/requests/new?text=${encodeURIComponent(`I need help with ${p.name}${p.city ? ` in ${p.city}` : ""}: `)}`}>Ask for work on this</Link>}
                {access.owner && <RemovePropertyButton id={p.id} name={p.name} />}
              </div>
            </article>
          ))}
          <p className="text-[length:var(--text-small)] text-muted">Rent tracking, inspection reports and maintenance history are not built yet. Until then, ask for an inspection as a request and you will get the report and photos there.</p>
        </div>
        {canEdit && <AddPropertyForm familyId={id} />}
      </div>
    </section>
  );
}
