import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate } from "@/lib/format";
import { isOpenStatus, STATUS_META } from "@/lib/request-engine";
import { familyAccess, requestsFor } from "@/lib/service-requests";
import { claimsFor } from "@/lib/store";

export const metadata = { title: "My Requests" };

export default async function Requests({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await familyAccess(id);
  if (!access.canReadRequests) notFound();
  const [list, claims] = await Promise.all([requestsFor(id), claimsFor(id)]);
  const base = `/family/${id}`;
  const groups = [{ title: "In progress", items: list.filter((r) => isOpenStatus(r.status)) }, { title: "Finished", items: list.filter((r) => !isOpenStatus(r.status)) }];
  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[length:var(--text-h1)] font-extrabold">My Requests</h1>
        {access.canCreate && <Link className="btn btn-primary" href={`${base}/requests/new`}>Get Anything Done</Link>}
      </div>
      {list.length === 0 && (
        <div className="card grid justify-items-start gap-2">
          <p className="font-semibold">No requests yet.</p>
          <p className="text-muted">Tell us what you need done in India, in your own words. A named coordinator takes it from there.</p>
        </div>
      )}
      {groups.filter((g) => g.items.length > 0).map((g) => (
        <div key={g.title} className="grid gap-3">
          <h2 className="text-[length:var(--text-h2)] font-bold">{g.title}</h2>
          <ul className="grid gap-3">
            {g.items.map((r) => {
              const s = STATUS_META[r.status];
              return (
                <li key={r.id}>
                  <Link href={`${base}/requests/${r.id}`} className="card lift grid gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[length:var(--text-micro)] font-semibold text-muted">{r.ref} · {r.category}</span>
                      <span className="flex flex-wrap gap-2">{r.priority === "urgent" && <span className="chip" data-tone="danger">Urgent</span>}<span className="chip" data-tone={s.tone}>{s.label}</span></span>
                    </div>
                    <span className="text-[length:var(--text-h3)] font-semibold [overflow-wrap:anywhere]">{r.title}</span>
                    <span className="text-[length:var(--text-small)] text-muted">{r.location ? `${r.location} · ` : ""}Asked {fmtDate(r.createdAt)} · With: {s.who}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {claims.length > 0 && <Link className="btn btn-secondary w-fit" href={`${base}/claims`}>See insurance claims ({claims.length})</Link>}
    </section>
  );
}
