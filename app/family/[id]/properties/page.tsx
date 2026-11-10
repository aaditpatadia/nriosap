import Link from "next/link";
import { notFound } from "next/navigation";
import { AddPropertyForm } from "@/components/PropertyForms";
import { Empty, PageHeader } from "@/components/ui";
import { isOpenStatus } from "@/lib/request-engine";
import { familyAccess, propertiesFor, requestsFor } from "@/lib/service-requests";

export const metadata = { title: "Properties & Assets" };
const KIND: Record<string, string> = { flat: "Flat", house: "House", plot: "Plot", shop: "Shop", vehicle: "Vehicle", other: "Other" };

export default async function Properties({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await familyAccess(id);
  if (!access.canReadRequests) notFound();
  const [list, requests] = await Promise.all([propertiesFor(id), requestsFor(id)]);
  return (
    <section className="grid gap-5">
      <PageHeader title="Properties & Assets" sub="Keep track of what you own in India, and ask for work on any of it." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
          {list.length === 0 && <div className="sm:col-span-2"><Empty title="Nothing added yet.">Add your first flat, house, plot or vehicle. Its bills, visits, documents and requests then come together on one page.</Empty></div>}
          {list.map((p) => {
            const open = requests.filter((r) => r.propertyId === p.id && isOpenStatus(r.status)).length;
            return (
              <Link key={p.id} href={`/family/${id}/properties/${p.id}`} className="card lift grid content-start gap-1">
                <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold [overflow-wrap:anywhere]">{p.name}</span><span className="chip">{KIND[p.kind]}</span></span>
                <span className="text-[length:var(--text-small)] text-muted [overflow-wrap:anywhere]">{[p.address, p.city].filter(Boolean).join(", ") || "No address yet"}</span>
                <span className="text-[length:var(--text-small)] text-muted">{p.tenantName ? `Tenant: ${p.tenantName}` : "No tenant recorded"} · {open} open request{open === 1 ? "" : "s"}</span>
              </Link>
            );
          })}
        </div>
        {(access.owner || access.staff) && <AddPropertyForm familyId={id} />}
      </div>
    </section>
  );
}
