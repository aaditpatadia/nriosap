export const dynamic = "force-dynamic";

import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { allProperties } from "@/lib/ops-console";

export const metadata = { title: "Properties" };

export default async function OpsProperties() {
  await requireStaff();
  const list = await allProperties();
  return (
    <section className="grid gap-4">
      <PageHeader title="Properties" />
      {list.length === 0 ? <Empty title="No properties yet." /> : (
        <ul className="card rows p-0">{list.map((p) => <li key={p.id}><Link className="flex items-center justify-between gap-3 px-4 py-3" href={`/family/${p.familyId}/properties/${p.id}`}><span className="min-w-0"><span className="block font-semibold [overflow-wrap:anywhere]">{p.name}</span><span className="block text-[length:var(--text-small)] text-muted">{p.familyName}{p.city ? ` · ${p.city}` : ""}{p.tenantName ? ` · Tenant: ${p.tenantName}` : ""}</span></span><span className="chip shrink-0">{p.kind}</span></Link></li>)}</ul>
      )}
    </section>
  );
}
