export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { openAlerts, runningTimer } from "@/lib/ops";
import { allTasks, getCoordinator, listFamilies } from "@/lib/store";
import { fromNow } from "@/lib/format";
import { slaState } from "@/lib/rules";
import type { Task } from "@/lib/types";

const LABEL = { todo: "To do", doing: "Doing", waiting_parent: "Waiting on parent", waiting_owner: "Waiting on owner", done: "Done" } as const;

type Filters = { owner?: string; family?: string; status?: string; sla?: string };

function SlaChip({ t, now }: { t: Task; now: Date }) {
  const emergency = t.title.startsWith("EMERGENCY");
  const s = slaState(t, now);
  if (emergency) return <span className="chip" data-tone="danger">Emergency</span>;
  if (s === "past") return <span className="chip" data-tone="danger">Past SLA</span>;
  if (s === "soon") return <span className="chip" data-tone="warn">Due within a day</span>;
  return <span className="chip" data-tone="ok">On time</span>;
}

export default async function Queue({ searchParams }: { searchParams: Promise<Filters> }) {
  const sp = await searchParams;
  const viewer = await requireStaff();
  const now = new Date();
  const [all, families, timer, alerts] = await Promise.all([allTasks(), listFamilies(), runningTimer(viewer.id), openAlerts()]);
  const status = sp.status ?? "open";
  const tasks = all
    .filter((t) => (status === "open" ? t.status !== "done" : status === "all" || t.status === status))
    .filter((t) => !sp.family || t.familyId === sp.family)
    .filter((t) => !sp.owner || t.ownerId === sp.owner)
    .filter((t) => !sp.sla || slaState(t, now) === sp.sla)
    .sort((a, b) => (a.title.startsWith("EMERGENCY") ? -1 : b.title.startsWith("EMERGENCY") ? 1 : a.dueAt.localeCompare(b.dueAt)));
  const ownerIds = [...new Set(all.map((t) => t.ownerId).filter(Boolean))];
  const owners = new Map(await Promise.all(ownerIds.map(async (id) => [id, (await getCoordinator(id))?.name ?? "Unassigned"] as const)));
  const famName = new Map(families.map((f) => [f.id, f.name]));
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[length:var(--text-h1)] font-bold">Task queue</h1>
        <div className="flex flex-wrap gap-2">
          <Link className="btn btn-secondary" href="/ops/onboard">Onboard a family</Link>
          <Link className="btn btn-primary" href="/ops/new">New task</Link>
        </div>
      </div>
      {timer && (
        <Link className="card flex flex-wrap items-center justify-between gap-2" href={`/ops/task/${timer.taskId}`} style={{ borderColor: "var(--accent)" }}>
          <span><span className="font-semibold">Timer running:</span> {timer.title}</span>
          <span className="text-muted">started {fromNow(timer.startedAt)}</span>
        </Link>
      )}
      {alerts.length > 0 && (
        <div className="card grid gap-2" style={{ borderColor: "var(--warn)" }}>
          <h2 className="text-[length:var(--text-h3)] font-semibold">Alerts</h2>
          <ul className="grid gap-1">{alerts.map((a) => <li key={a.id}><span className="chip mr-2" data-tone="warn">{a.kind === "sla" ? "SLA" : a.kind === "hours" ? "Hours" : a.kind === "no_reply" ? "No reply" : a.kind === "renewal" ? "Renewal" : "Bill"}</span>{a.body}</li>)}</ul>
        </div>
      )}
      <form className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end" aria-label="Filter tasks">
        <label className="field">Owner
          <select className="input" name="owner" defaultValue={sp.owner ?? ""}>
            <option value="">Everyone</option>
            {ownerIds.map((id) => <option key={id} value={id}>{owners.get(id)}</option>)}
          </select>
        </label>
        <label className="field">Family
          <select className="input" name="family" defaultValue={sp.family ?? ""}>
            <option value="">All families</option>
            {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="field">Status
          <select className="input" name="status" defaultValue={status}>
            <option value="open">Open</option>
            {Object.entries(LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            <option value="all">All</option>
          </select>
        </label>
        <label className="field">SLA
          <select className="input" name="sla" defaultValue={sp.sla ?? ""}>
            <option value="">Any</option>
            <option value="past">Past SLA</option>
            <option value="soon">Due within a day</option>
            <option value="ok">On time</option>
          </select>
        </label>
        <button className="btn btn-secondary">Apply</button>
      </form>
      <p role="status" className="text-muted">{tasks.length} task{tasks.length === 1 ? "" : "s"}</p>

      {/* Phones get cards, wider screens get the table. */}
      <ul className="grid gap-3 md:hidden" aria-label="Tasks">
        {tasks.map((t) => (
          <li key={t.id} className="card grid gap-2">
            <Link className="font-semibold underline" href={`/ops/task/${t.id}`}>{t.title}</Link>
            <p className="text-muted">{famName.get(t.familyId)} · {owners.get(t.ownerId)} · due {fromNow(t.dueAt)}</p>
            <div className="flex flex-wrap gap-2"><span className="chip">{LABEL[t.status]}</span><SlaChip t={t} now={now} /></div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface md:block">
        <table className="w-full text-left text-[length:var(--text-small)]">
          <caption className="sr-only">Tasks sorted by due time</caption>
          <thead className="text-muted"><tr><th className="p-3">Task</th><th className="p-3">Family</th><th className="p-3">Owner</th><th className="p-3">Status</th><th className="p-3">Due</th><th className="p-3">SLA</th></tr></thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-t border-line">
                <td className="p-3"><Link className="font-semibold underline" href={`/ops/task/${t.id}`}>{t.title}</Link></td>
                <td className="p-3">{famName.get(t.familyId)}</td>
                <td className="p-3">{owners.get(t.ownerId)}</td>
                <td className="p-3"><span className="chip">{LABEL[t.status]}</span></td>
                <td className="p-3">{fromNow(t.dueAt)}</td>
                <td className="p-3"><SlaChip t={t} now={now} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
