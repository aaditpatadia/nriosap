import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { isOpenStatus, REQUEST_STATUSES, STATUS_META, type RequestStatus } from "@/lib/request-engine";
import { allRequests } from "@/lib/service-requests";

export const metadata = { title: "Requests" };

export default async function OpsRequests({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const all = await allRequests();
  const f = sp.status ?? "open";
  const list = all.filter((r) => (f === "open" ? isOpenStatus(r.status) : f === "all" || r.status === f));
  const count = (s: RequestStatus) => all.filter((r) => r.status === s).length;
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[length:var(--text-h1)] font-bold">Customer requests</h1>
        <Link className="btn btn-secondary" href="/ops">Task queue</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["New", count("submitted")], ["Waiting on customer", count("awaiting_information") + count("awaiting_approval") + count("awaiting_customer")], ["In progress", count("in_progress") + count("assigned") + count("approved")], ["Disputed", count("disputed")]].map(([l, n]) => <div key={l as string} className="card"><p className="text-3xl font-extrabold tabular-nums">{n}</p><p className="text-[length:var(--text-small)] text-muted">{l}</p></div>)}
      </div>
      <form className="flex flex-wrap items-end gap-2" aria-label="Filter requests">
        <label className="field">Status
          <select className="input" name="status" defaultValue={f}>
            <option value="open">Open</option><option value="all">All</option>
            {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </label>
        <button className="btn btn-secondary">Filter</button>
      </form>
      {list.length === 0 && <p className="card text-muted">Nothing here.</p>}
      <ul className="grid gap-3">
        {list.map((r) => (
          <li key={r.id}>
            <Link href={`/ops/requests/${r.id}`} className="card lift grid gap-1">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[length:var(--text-micro)] font-semibold text-muted">{r.ref} · {r.familyName} · {r.category}</span>
                <span className="flex flex-wrap gap-2">{r.needsProfessional && <span className="chip" data-tone="warn">Needs a professional</span>}{r.priority === "urgent" && <span className="chip" data-tone="danger">Urgent</span>}<span className="chip" data-tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</span></span>
              </span>
              <span className="font-semibold [overflow-wrap:anywhere]">{r.title}</span>
              <span className="text-[length:var(--text-small)] text-muted">{r.location ?? "Location not given"} · {fmtDate(r.createdAt)} · {r.coordinatorName ?? "Unassigned"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
