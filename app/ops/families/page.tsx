export const dynamic = "force-dynamic";

import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { loadPlans } from "@/lib/plans";
import { planForPrice } from "@/lib/plan-rules";
import { isOpenStatus } from "@/lib/request-engine";
import { allRequests } from "@/lib/service-requests";
import { getCoordinator, listFamilies } from "@/lib/store";

export const metadata = { title: "Families" };

export default async function Families({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff();
  const { q } = await searchParams;
  const [families, requests, plans] = await Promise.all([listFamilies(), allRequests(), loadPlans()]);
  const search = (q ?? "").trim().toLowerCase().slice(0, 80);
  const shown = families.filter((f) => !search || `${f.name} ${f.owner.name} ${f.parent.city}`.toLowerCase().includes(search));
  const coords = new Map(await Promise.all([...new Set(families.map((f) => f.coordinatorId).filter(Boolean))].map(async (id) => [id, (await getCoordinator(id))?.name] as const)));
  return (
    <section className="grid gap-4">
      <PageHeader title="Families"><a className="btn btn-secondary" href="/ops/families/export" download>Download hours CSV</a><Link className="btn btn-secondary" href="/ops/onboard">Onboard a family</Link></PageHeader>
      <form className="flex flex-wrap items-end gap-2" role="search"><label className="field min-w-0 flex-1 basis-56">Search<input className="input" name="q" defaultValue={q ?? ""} placeholder="Family, customer or city" /></label><button className="btn btn-secondary">Search</button></form>
      {shown.length === 0 && <Empty title="No families found." />}
      {shown.length > 0 && (
        <ul className="card rows p-0">
          {shown.map((f) => (
            <li key={f.id}><Link href={`/ops/families/${f.id}`} className="grid gap-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4"><span className="min-w-0"><span className="block font-semibold">{f.name}</span><span className="block text-[length:var(--text-small)] text-muted">{f.owner.name}{f.owner.country ? ` in ${f.owner.country}` : ""} · {f.parent.city || "City not given"} · {f.coordinatorId ? coords.get(f.coordinatorId) : "No coordinator"}</span></span><span className="flex flex-wrap gap-2"><span className="chip">{planForPrice(f.planUsd, plans).name}</span><span className="chip">{requests.filter((r) => r.familyId === f.id && isOpenStatus(r.status)).length} open</span></span></Link></li>
          ))}
        </ul>
      )}
    </section>
  );
}
