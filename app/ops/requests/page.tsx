import Link from "next/link";
import { Empty, Metric, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { isOpenStatus, REQUEST_STATUSES, STATUS_META, type RequestStatus } from "@/lib/request-engine";
import { allRequests } from "@/lib/service-requests";

export const metadata = { title: "Requests" };

export default async function OpsRequests({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const all = await allRequests();
  const f = sp.status ?? "open";
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const list = all.filter((r) => (f === "open" ? isOpenStatus(r.status) : f === "all" || r.status === f)).filter((r) => !q || `${r.ref} ${r.title} ${r.familyName} ${r.location}`.toLowerCase().includes(q));
  const count = (s: RequestStatus) => all.filter((r) => r.status === s).length;
  return (
    <section className="grid gap-4">
      <PageHeader title="Requests" />
      <div className="metric-strip">
        <Metric label="New" value={count("submitted")} />
        <Metric label="Waiting on customer" value={count("awaiting_information") + count("awaiting_approval") + count("awaiting_customer")} />
        <Metric label="In progress" value={count("in_progress") + count("assigned") + count("approved")} />
        <Metric label="Disputed" value={count("disputed")} alert />
      </div>
      <form className="flex flex-wrap items-end gap-2" aria-label="Filter requests">
        <label className="field min-w-0 flex-1 basis-56">Search<input className="input" name="q" defaultValue={sp.q ?? ""} placeholder="Reference, title, family or city" /></label>
        <label className="field">Status
          <select className="input" name="status" defaultValue={f}><option value="open">Open</option><option value="all">All</option>{REQUEST_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select>
        </label>
        <button className="btn btn-secondary">Filter</button>
      </form>
      {list.length === 0 && <Empty title="Nothing here." />}
      {list.length > 0 && (
        <ul className="card rows p-0">
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`/ops/requests/${r.id}`} className="grid gap-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
                <span className="min-w-0"><span className="block font-semibold [overflow-wrap:anywhere]">{r.ref}: {r.title}</span><span className="block text-[length:var(--text-small)] text-muted">{r.familyName} · {r.category} · {r.location ?? "Location not given"} · {fmtDate(r.createdAt)} · {r.coordinatorName ?? "Unassigned"}</span></span>
                <span className="flex flex-wrap gap-2">{r.escalatedAt && <span className="chip" data-tone="danger">Escalated</span>}{r.needsProfessional && <span className="chip" data-tone="warn">Needs a professional</span>}{r.priority === "urgent" && <span className="chip" data-tone="danger">Urgent</span>}<span className="chip" data-tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
