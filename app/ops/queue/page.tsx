export const dynamic = "force-dynamic";

import Link from "next/link";
import { deleteFilterAction, saveFilterAction } from "@/app/ops/console-actions";
import { Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { allRequests } from "@/lib/service-requests";
import { runningTimer } from "@/lib/ops";
import { savedFilters } from "@/lib/ops-console";
import { allTasks, getCoordinator, listFamilies } from "@/lib/store";
import { fromNow } from "@/lib/format";
import { slaState } from "@/lib/rules";
import type { Task } from "@/lib/types";

const LABEL = { todo: "To do", doing: "Doing", waiting_parent: "Waiting on parent", waiting_owner: "Waiting on owner", done: "Done" } as const;
const KIND: Record<Task["kind"], string> = { claim: "Claim", bill: "Bill", records: "Records", errand: "Errand", checkin: "Check-in", renewal: "Renewal" };
type Filters = { owner?: string; family?: string; status?: string; sla?: string; kind?: string; priority?: string; due?: string; q?: string };

function SlaChip({ t, now }: { t: Task; now: Date }) {
  if (t.title.startsWith("EMERGENCY")) return <span className="chip" data-tone="danger">Emergency</span>;
  const s = slaState(t, now);
  if (s === "past") return <span className="chip" data-tone="danger">Past SLA</span>;
  if (s === "soon") return <span className="chip" data-tone="warn">Due within a day</span>;
  return <span className="chip" data-tone="ok">On time</span>;
}

export default async function Queue({ searchParams }: { searchParams: Promise<Filters> }) {
  const sp = await searchParams;
  const viewer = await requireStaff();
  const now = new Date();
  const [all, families, requests, saved, timer] = await Promise.all([allTasks(), listFamilies(), allRequests(), savedFilters(viewer.id), runningTimer(viewer.id)]);
  const urgent = new Set(requests.filter((r) => r.priority === "urgent").map((r) => r.taskId));
  const isUrgent = (t: Task) => urgent.has(t.id) || t.title.startsWith("EMERGENCY");
  const status = sp.status ?? "open";
  const search = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const famName = new Map(families.map((f) => [f.id, f.name]));
  const tasks = all
    .filter((t) => (status === "open" ? t.status !== "done" : status === "all" || t.status === status))
    .filter((t) => !sp.family || t.familyId === sp.family)
    .filter((t) => !sp.owner || t.ownerId === sp.owner)
    .filter((t) => !sp.sla || slaState(t, now) === sp.sla)
    .filter((t) => !sp.kind || t.kind === sp.kind)
    .filter((t) => !sp.priority || (sp.priority === "urgent") === isUrgent(t))
    .filter((t) => !sp.due || (t.dueAt && new Date(t.dueAt).getTime() - now.getTime() < Number(sp.due) * 86_400_000))
    .filter((t) => !search || `${t.title} ${famName.get(t.familyId) ?? ""}`.toLowerCase().includes(search))
    .sort((a, b) => (a.title.startsWith("EMERGENCY") ? -1 : b.title.startsWith("EMERGENCY") ? 1 : a.dueAt.localeCompare(b.dueAt)));
  const ownerIds = [...new Set(all.map((t) => t.ownerId).filter(Boolean))];
  const owners = new Map(await Promise.all(ownerIds.map(async (id) => [id, (await getCoordinator(id))?.name ?? "Unassigned"] as const)));
  const query = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <section className="grid gap-4">
      <PageHeader title="Task Queue"><Link className="btn btn-secondary" href="/ops/new">New task</Link></PageHeader>
      {timer && <Link className="card flex flex-wrap items-center justify-between gap-2" href={`/ops/task/${timer.taskId}`} style={{ borderColor: "var(--accent)" }}><span><span className="font-semibold">Timer running:</span> {timer.title}</span><span className="text-muted">started {fromNow(timer.startedAt)}</span></Link>}
      <form className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 lg:items-end" aria-label="Filter tasks">
        <label className="field sm:col-span-2 lg:col-span-4 xl:col-span-8">Search<input className="input" name="q" defaultValue={sp.q ?? ""} placeholder="Task or family" /></label>
        <label className="field">Owner<select className="input" name="owner" defaultValue={sp.owner ?? ""}><option value="">Everyone</option>{ownerIds.map((id) => <option key={id} value={id}>{owners.get(id)}</option>)}</select></label>
        <label className="field">Family<select className="input" name="family" defaultValue={sp.family ?? ""}><option value="">All families</option>{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label className="field">Category<select className="input" name="kind" defaultValue={sp.kind ?? ""}><option value="">All</option>{Object.entries(KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field">Status<select className="input" name="status" defaultValue={status}><option value="open">Open</option>{Object.entries(LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}<option value="all">All</option></select></label>
        <label className="field">Priority<select className="input" name="priority" defaultValue={sp.priority ?? ""}><option value="">Any</option><option value="urgent">Urgent</option><option value="normal">Normal</option></select></label>
        <label className="field">Due<select className="input" name="due" defaultValue={sp.due ?? ""}><option value="">Any time</option><option value="1">Within a day</option><option value="7">Within a week</option></select></label>
        <label className="field">SLA<select className="input" name="sla" defaultValue={sp.sla ?? ""}><option value="">Any</option><option value="past">Past SLA</option><option value="soon">Due within a day</option><option value="ok">On time</option></select></label>
        <button className="btn btn-secondary">Apply</button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="mr-auto text-[length:var(--text-small)] text-muted">{tasks.length} task{tasks.length === 1 ? "" : "s"}</p>
        {saved.map((f) => (
          <span key={f.id} className="inline-flex items-center">
            <Link className="btn btn-ghost" href={`/ops/queue?${f.query}`}>{f.name}</Link>
            <form action={deleteFilterAction.bind(null, f.id)}><button className="btn btn-ghost btn-icon text-muted" aria-label={`Delete saved view ${f.name}`}>×</button></form>
          </span>
        ))}
        {query && <form action={saveFilterAction} className="flex items-end gap-2"><input type="hidden" name="query" value={query} /><input className="input w-40" name="name" aria-label="Name this view" placeholder="Name this view" maxLength={60} required /><button className="btn btn-secondary">Save view</button></form>}
      </div>
      {tasks.length === 0 && <Empty title="No tasks match." />}
      {/* Phones get cards, wider screens get the table. */}
      <ul className="grid gap-3 md:hidden" aria-label="Tasks">
        {tasks.map((t) => (
          <li key={t.id} className="card grid gap-2">
            <Link className="font-semibold" href={`/ops/task/${t.id}`}>{t.title}</Link>
            <p className="text-[length:var(--text-small)] text-muted">{famName.get(t.familyId)} · {owners.get(t.ownerId)} · due {fromNow(t.dueAt)}</p>
            <div className="flex flex-wrap gap-2"><span className="chip">{LABEL[t.status]}</span>{isUrgent(t) && <span className="chip" data-tone="danger">Urgent</span>}<SlaChip t={t} now={now} /></div>
          </li>
        ))}
      </ul>
      {tasks.length > 0 && (
        <div className="table-box hidden md:block">
          <table className="data-table">
            <caption className="sr-only">Tasks sorted by due time</caption>
            <thead><tr><th>Task</th><th>Family</th><th>Category</th><th>Owner</th><th>Status</th><th>Due</th><th>Priority</th><th>SLA</th></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td><Link className="font-semibold" href={`/ops/task/${t.id}`}>{t.title}</Link></td>
                  <td>{famName.get(t.familyId)}</td><td>{KIND[t.kind] ?? t.kind}</td><td>{owners.get(t.ownerId)}</td>
                  <td><span className="chip">{LABEL[t.status]}</span></td>
                  <td>{fromNow(t.dueAt)}</td>
                  <td>{isUrgent(t) ? <span className="chip" data-tone="danger">Urgent</span> : "Normal"}</td>
                  <td><SlaChip t={t} now={now} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
