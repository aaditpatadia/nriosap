import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeader, Tabs } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { isOpenStatus, STATUS_META, type RequestStatus } from "@/lib/request-engine";
import { familyAccess, requestsFor } from "@/lib/service-requests";
import { claimsFor } from "@/lib/store";

export const metadata = { title: "My Requests" };
const WAITING: RequestStatus[] = ["awaiting_information", "awaiting_approval", "awaiting_customer"];

export default async function Requests({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string }> }) {
  const { id } = await params;
  const { show = "active" } = await searchParams;
  const access = await familyAccess(id);
  if (!access.canReadRequests) notFound();
  const [list, claims] = await Promise.all([requestsFor(id), claimsFor(id)]);
  const base = `/family/${id}`;
  const filters: Record<string, (s: RequestStatus) => boolean> = { active: isOpenStatus, waiting: (s) => WAITING.includes(s), finished: (s) => !isOpenStatus(s), all: () => true };
  const pass = filters[show] ?? filters.active;
  const shown = list.filter((r) => pass(r.status));
  const tab = (key: string, label: string) => ({ href: `${base}/requests?show=${key}`, label: `${label} (${list.filter((r) => filters[key](r.status)).length})`, active: show === key });
  return (
    <section className="grid gap-5">
      <PageHeader title="My Requests">{access.canCreate && <Link className="btn btn-secondary" href={`${base}/requests/new`}>New request</Link>}</PageHeader>
      <Tabs items={[tab("active", "Active"), tab("waiting", "Waiting on you"), tab("finished", "Finished"), tab("all", "All")]} />
      {shown.length === 0 && <Empty title={list.length === 0 ? "No requests yet." : "Nothing in this view."}>Tell us what you need done in India, in your own words. A named coordinator takes it from there.</Empty>}
      {shown.length > 0 && (
        <ul className="card rows p-0">
          {shown.map((r) => {
            const s = STATUS_META[r.status];
            return (
              <li key={r.id}>
                <Link href={`${base}/requests/${r.id}`} className="grid gap-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
                  <span className="min-w-0"><span className="block font-semibold [overflow-wrap:anywhere]">{r.title}</span><span className="block text-[length:var(--text-small)] text-muted">{r.ref} · {r.category}{r.location ? ` · ${r.location}` : ""} · {fmtDate(r.createdAt)}</span></span>
                  <span className="flex flex-wrap gap-2">{r.priority === "urgent" && <span className="chip" data-tone="danger">Urgent</span>}<span className="chip" data-tone={s.tone}>{s.label}</span></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {claims.length > 0 && <Link className="btn btn-secondary w-fit" href={`${base}/claims`}>See insurance claims ({claims.length})</Link>}
    </section>
  );
}
