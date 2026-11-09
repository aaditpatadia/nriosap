import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/Timeline";
import { approvalsFor, claimsFor, getFamily, timeline } from "@/lib/store";

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = (await getFamily(id));
  if (!fam) notFound();
  const pending = (await approvalsFor(id)).filter((a) => a.status === "pending");
  const queries = (await claimsFor(id)).filter((c) => c.status === "query" || c.missing.length > 0);
  const needs = pending.length;
  const headline = needs === 0 ? "All on track" : `${needs} thing${needs === 1 ? "" : "s"} need${needs === 1 ? "s" : ""} you`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section aria-labelledby="status" className="grid content-start gap-4">
        <div>
          <h1 id="status" className="text-[length:var(--text-h1)] font-bold">{headline}</h1>
          <p className="mt-1 text-muted">for {fam.parent.name} in {fam.parent.city}</p>
        </div>
        {needs > 0 && (
          <Link href={`/family/${id}/approvals`} className="card flex items-center justify-between gap-3 border-warn" style={{ borderColor: "var(--warn)" }}>
            <span><span className="font-semibold">Needs you:</span> {pending[0].summary}</span>
            <span className="btn btn-primary">Review</span>
          </Link>
        )}
        {queries.length > 0 && (
          <div className="card">
            <p className="font-semibold">Open claim: {queries[0].hospital}</p>
            <p className="text-muted">Still missing: {queries[0].missing.join(", ")}.</p>
            <Link className="btn btn-ghost mt-2" href={`/family/${id}/claims`}>See claim</Link>
          </div>
        )}
        <h2 className="mt-2 text-[length:var(--text-h2)] font-bold">What is happening</h2>
        <Timeline events={(await timeline(id))} />
      </section>
      <aside className="grid content-start gap-4" aria-label="Parent">
        <div className="card grid gap-1">
          <p className="text-[length:var(--text-h3)] font-semibold">{fam.parent.name}</p>
          <p className="text-muted">{fam.parent.city} · speaks {fam.parent.language}</p>
          <span className="chip mt-2 w-fit" data-tone="ok">Consent on file</span>
          <p className="mt-2 text-[length:var(--text-small)] text-muted">Your parent only uses WhatsApp. No app, no login.</p>
          <Link className="btn btn-secondary mt-2" href={`/chat/${id}`}>See their WhatsApp view</Link>
        </div>
        <div className="card text-[length:var(--text-small)] text-muted">
          <p className="font-semibold text-ink">What the desk will not do</p>
          <p className="mt-1">Give medical, legal or tax advice, or pay or file anything without your approval.</p>
        </div>
      </aside>
    </div>
  );
}
