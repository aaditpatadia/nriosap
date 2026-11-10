export const dynamic = "force-dynamic";

import { ScheduleVisitForm, VisitReportForm } from "@/components/OpsForms";
import { Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/format";
import { allProperties, allVisits } from "@/lib/ops-console";
import { listFamilies } from "@/lib/store";

export const metadata = { title: "Visits & Scheduling" };

export default async function Visits() {
  await requireStaff();
  const [visits, families, properties] = await Promise.all([allVisits(), listFamilies(), allProperties()]);
  const upcoming = visits.filter((v) => v.status === "scheduled").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const done = visits.filter((v) => v.status === "completed").slice(0, 20);
  return (
    <section className="grid gap-5">
      <PageHeader title="Visits & Scheduling" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="grid gap-4">
          <h2 className="section-title">Scheduled</h2>
          {upcoming.length === 0 && <Empty title="No visits scheduled." />}
          {upcoming.map((v) => (
            <article key={v.id} className="card grid gap-1">
              <h3 className="font-semibold [overflow-wrap:anywhere]">{v.purpose}</h3>
              <p className="text-[length:var(--text-small)] text-muted">{v.familyName}{v.propertyName ? ` · ${v.propertyName}` : ""} · {fmtDate(v.scheduledAt)}, {fmtTime(v.scheduledAt)} · {v.coordinatorName ?? "Unassigned"}</p>
              <VisitReportForm visitId={v.id} familyId={v.familyId} purpose={v.purpose} />
            </article>
          ))}
          {done.length > 0 && <><h2 className="section-title">Reports written</h2><ul className="card rows p-0">{done.map((v) => <li key={v.id} className="px-4 py-3 text-[length:var(--text-small)]"><span className="font-medium [overflow-wrap:anywhere]">{v.purpose}</span><span className="block text-muted">{v.familyName} · {fmtDate(v.scheduledAt)}</span></li>)}</ul></>}
        </div>
        <ScheduleVisitForm families={families.map((f) => ({ id: f.id, name: f.name }))} properties={properties.map((p) => ({ id: p.id, familyId: p.familyId, name: p.name }))} />
      </div>
    </section>
  );
}
