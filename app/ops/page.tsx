import Link from "next/link";
import { redirect } from "next/navigation";
import { ClearAlert } from "@/components/StaffForms";
import { Empty, Metric, PageHeader, Panel } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { openAlerts, runningTimer } from "@/lib/ops";
import { opsOverview } from "@/lib/ops-console";
import { fromNow } from "@/lib/format";
import { STATUS_META } from "@/lib/request-engine";

export const dynamic = "force-dynamic";
const ALERT: Record<string, string> = { sla: "SLA", hours: "Hours", no_reply: "No reply", renewal: "Renewal", security: "Security", bill: "Bill" };

export default async function OpsOverview({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  // Old links to the queue with filters still land in the right place.
  if (Object.keys(sp).length > 0) redirect(`/ops/queue?${new URLSearchParams(sp).toString()}`);
  const viewer = await requireStaff();
  const [o, alerts, timer] = await Promise.all([opsOverview(), openAlerts(), runningTimer(viewer.id)]);
  const max = Math.max(1, ...o.workload.map((w) => w.open));
  return (
    <section className="grid gap-5">
      <PageHeader title="Overview" sub={viewer.role === "admin" ? "Every family on the desk." : "The families assigned to you."}>
        <Link className="btn btn-secondary" href="/ops/onboard">Onboard a family</Link>
        <Link className="btn btn-secondary" href="/ops/new">New task</Link>
      </PageHeader>
      {timer && <Link className="card flex flex-wrap items-center justify-between gap-2" href={`/ops/task/${timer.taskId}`} style={{ borderColor: "var(--accent)" }}><span><span className="font-semibold">Timer running:</span> {timer.title}</span><span className="text-muted">started {fromNow(timer.startedAt)}</span></Link>}
      <div className="metric-strip">
        <Metric href="/ops/families" label="Active families" value={o.families} />
        <Metric href="/ops/requests" label="Open requests" value={o.openRequests} />
        <Metric href="/ops/queue?sla=past" label="Tasks overdue" value={o.overdue} alert />
        <Metric href="/ops/requests?status=awaiting_approval" label="Awaiting customer approval" value={o.awaitingApproval} />
        <Metric href="/ops/requests?status=awaiting_information" label="Awaiting information" value={o.awaitingInformation} />
        <Metric href="/ops/visits" label="Visits today" value={o.visitsToday} />
        <Metric label="Completed this month" value={o.completedThisMonth} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="grid gap-5">
          {alerts.length > 0 && <Panel title="Alerts"><ul className="rows">{alerts.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[length:var(--text-small)]"><span><span className="chip mr-2" data-tone="warn">{ALERT[a.kind] ?? a.kind}</span>{a.body}</span><ClearAlert id={a.id} /></li>)}</ul></Panel>}
          <Panel title="Newest open requests" action={<Link className="text-[length:var(--text-small)] font-semibold text-accent" href="/ops/requests">See all</Link>}>
            {o.newest.length === 0 ? <Empty title="No open requests." /> : <ul className="rows">{o.newest.map((r) => <li key={r.id}><Link className="row-link" href={`/ops/requests/${r.id}`}><span className="min-w-0 font-medium [overflow-wrap:anywhere]">{r.title}<span className="block text-[length:var(--text-small)] font-normal text-muted">{r.ref} · {r.familyName} · {fmtDate(r.createdAt)}</span></span><span className="chip shrink-0" data-tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</span></Link></li>)}</ul>}
          </Panel>
        </div>
        <Panel title="Coordinator workload">
          {o.workload.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">No coordinators yet.</p> : (
            <ul className="grid gap-3">
              {o.workload.map((w) => (
                <li key={w.id} className="grid gap-1 text-[length:var(--text-small)]">
                  <span className="flex justify-between gap-2"><span className="font-medium">{w.name}</span><span className="text-muted">{w.open} open{w.late ? `, ${w.late} late` : ""}</span></span>
                  <span className="progress-track block"><span className="progress-fill stage-fill block" style={{ transform: `scaleX(${w.open / max})` }} /></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}
