export const dynamic = "force-dynamic";

import { Empty, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { coordinatorStats } from "@/lib/ops-console";

export const metadata = { title: "Coordinators" };

export default async function Coordinators() {
  await requireAdmin();
  const list = await coordinatorStats();
  return (
    <section className="grid gap-4">
      <PageHeader title="Coordinators" sub="Plain counts from the desk's own records. These are not scores, and a high or low count needs context." />
      {list.length === 0 ? <Empty title="No coordinators yet." /> : (
        <div className="table-box" role="region" aria-label="Coordinators" tabIndex={0}>
          <table className="data-table min-w-[720px]">
            <thead><tr><th>Coordinator</th><th>City</th><th>Families</th><th>Pending tasks</th><th>Completed tasks</th><th>Past SLA</th><th>Visits ahead</th><th>Hours this month</th></tr></thead>
            <tbody>{list.map((c) => <tr key={c.id}><td className="font-semibold">{c.name}</td><td>{c.city || "Not set"}</td><td>{c.families}</td><td>{c.pending}</td><td>{c.completed}</td><td>{c.pastSla}</td><td>{c.visits}</td><td>{c.hours.toFixed(1)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
