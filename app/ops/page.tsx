import Link from "next/link";
import { redirect } from "next/navigation";
import { ClearAlert } from "@/components/StaffForms";
import { BandQuickStart, DarkBand, RequestTable, StatCards } from "@/components/HomeOverview";
import { Empty, Metric, PageHeader, Panel } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { openAlerts, runningTimer } from "@/lib/ops";
import { opsOverview } from "@/lib/ops-console";
import { fromNow } from "@/lib/format";

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
      <DarkBand
        label="Today on the desk"
        today={o.today}
        note={o.overdue > 0 ? { text: `${o.overdue} task${o.overdue === 1 ? " is" : "s are"} past the promised time.`, href: "/ops/queue?sla=past" } : alerts.length > 0 ? { text: `${alerts.length} alert${alerts.length === 1 ? "" : "s"} to clear. See below.`, href: "#alerts" } : { text: "Nothing is late.", ok: true }}
        pill={{ label: "Visits and dates", href: "/ops/visits" }}
        empty="Booked visits and needed-by dates show here."
        calendar={o.calendar}
        quick={<BandQuickStart prompt="What needs doing?" options={[["Work the task queue", "/ops/queue"], ["Review documents", "/ops/documents"], ["Quotations and approvals", "/ops/approvals"], ["Onboard a family", "/ops/onboard"]]} cta={{ label: "New task", href: "/ops/new" }} />}
      />
      <StatCards cards={[
        { label: "Open requests", value: o.openRequests, href: "/ops/requests", icon: "list", sub: o.awaitingInformation ? `${o.awaitingInformation} awaiting information` : "None waiting on a customer", go: "See all" },
        { label: "Tasks overdue", value: o.overdue, href: "/ops/queue?sla=past", icon: "queue", sub: o.overdue ? "Past the promised time" : "All on time", tone: o.overdue ? "danger" : "ok" },
        { label: "Awaiting customer approval", value: o.awaitingApproval, href: "/ops/requests?status=awaiting_approval", icon: "check", sub: "Quotations sent" },
        { label: "Visits today", value: o.visitsToday, href: "/ops/visits", icon: "calendar", sub: "Booked for today" },
      ]} />
      <div className="metric-strip" data-cols="3">
        <Metric href="/ops/families" label="Active families" value={o.families} />
        <Metric href="/ops/requests?status=awaiting_information" label="Awaiting information" value={o.awaitingInformation} />
        <Metric label="Completed this month" value={o.completedThisMonth} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="grid gap-5">
          {alerts.length > 0 && <Panel id="alerts" className="scroll-mt-24" title="Alerts"><ul className="rows">{alerts.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[length:var(--text-small)]"><span><span className="chip mr-2" data-tone="warn">{ALERT[a.kind] ?? a.kind}</span>{a.body}</span><ClearAlert id={a.id} /></li>)}</ul></Panel>}
          <Panel title="Newest open requests" action={<Link className="text-[length:var(--text-small)] font-semibold text-accent" href="/ops/requests">See all</Link>}>
            {o.newest.length === 0 ? <Empty title="No open requests." /> : <RequestTable base="/ops/requests" requests={o.newest} quotes={[]} desk />}
          </Panel>
        </div>
        <div className="grid content-start gap-5">
        <Panel title="Desk tools">
          <ul className="rows">{[["/ops/pricing", "Pricing"], ["/ops/visits", "Visits and scheduling"], ["/ops/approvals", "Quotations and approvals"], ["/ops/documents", "Document review"], ["/ops/properties", "Properties"], ["/ops/partners", "Service partners"], ["/ops/reports", "Reports"]].map(([href, label]) => <li key={href}><Link className="row-link font-medium" href={href}>{label}<span aria-hidden className="text-muted">›</span></Link></li>)}</ul>
        </Panel>
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
      </div>
    </section>
  );
}
