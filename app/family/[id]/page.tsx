import Link from "next/link";
import { notFound } from "next/navigation";
import { OwnerConsentForm } from "@/components/OwnerConsentForm";
import { IndiaClock } from "@/components/IndiaClock";
import { Timeline } from "@/components/Timeline";
import { getViewer, isDemoMode } from "@/lib/auth";
import { OWNER_CONSENT_TEXT, REQUIRED_PURPOSES } from "@/lib/consent";
import { consentsFor } from "@/lib/onboarding";
import { approvalsFor, claimsFor, getFamily, timeline } from "@/lib/store";
import { PURPOSES } from "@/lib/upload-rules";

const CONSENT = {
  granted: { label: "Consent on file", tone: "ok" },
  pending: { label: "Waiting for the consent call", tone: "warn" },
  withdrawn: { label: "Consent withdrawn", tone: "danger" },
} as const;

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [approvals, claims, events, consents, viewer] = await Promise.all([approvalsFor(id), claimsFor(id), timeline(id), consentsFor(id), getViewer()]);
  const pending = approvals.filter((a) => a.status === "pending");
  const open = claims.filter((c) => c.status === "query" || c.missing.length > 0);
  const ownerPending = viewer?.id === fam.owner.id && REQUIRED_PURPOSES.some((p) => !consents.find((c) => c.subject === "owner" && c.purpose === p)?.grantedAt);
  const needs = pending.length + (ownerPending ? 1 : 0);
  const headline = needs === 0 ? "All on track" : `${needs} thing${needs === 1 ? "" : "s"} need${needs === 1 ? "s" : ""} you`;
  const c = CONSENT[fam.parent.consentStatus];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section aria-labelledby="status" className="grid content-start gap-4">
        <div>
          <h1 id="status" className="flex items-center gap-3 text-[length:var(--text-h1)] font-bold"><span aria-hidden className="orb" data-tone={needs === 0 ? "ok" : "warn"} />{headline}</h1>
          <p className="mt-1 text-muted">{fam.parent.isSelf ? `Your work in ${fam.parent.city}` : `for ${fam.parent.name} in ${fam.parent.city}`}</p>
        </div>
        {ownerPending && <OwnerConsentForm familyId={id} items={PURPOSES.map((p) => ({ purpose: p, text: OWNER_CONSENT_TEXT[p] }))} />}
        {pending.length > 0 && (
          <Link href={`/family/${id}/approvals`} className="card lift flex items-center justify-between gap-3" style={{ borderColor: "var(--warn)" }}>
            <span><span className="font-semibold">Needs you:</span> {pending[0].summary}</span>
            <span className="btn btn-primary">Review</span>
          </Link>
        )}
        {open.length > 0 && (
          <div className="card">
            <p className="font-semibold">Open claim: {open[0].hospital}</p>
            <p className="text-muted">Still missing: {open[0].missing.join(", ") || "nothing"}.</p>
            <Link className="btn btn-ghost mt-2" href={`/family/${id}/claims`}>See claim</Link>
          </div>
        )}
        <h2 className="mt-2 text-[length:var(--text-h2)] font-bold">What is happening</h2>
        <Timeline events={events} />
      </section>
      <aside className="grid content-start gap-4" aria-label="Who this is for">
        <IndiaClock city={fam.parent.city} />
        <div className="card grid gap-1">
          <p className="text-[length:var(--text-h3)] font-semibold">{fam.parent.isSelf ? "Where we are working" : fam.parent.name}</p>
          <p className="text-muted">{fam.parent.city}{fam.parent.isSelf ? "" : ` · speaks ${fam.parent.language}`}</p>
          {!fam.parent.isSelf && <span className="chip mt-2 w-fit" data-tone={c.tone}>{c.label}</span>}
          <p className="mt-2 text-[length:var(--text-small)] text-muted">{fam.parent.isSelf ? "Message your coordinator on WhatsApp any time." : "They only use WhatsApp. No app, no login."}</p>
          {isDemoMode() && <Link className="btn btn-secondary mt-2" href={`/chat/${id}`}>See their WhatsApp view</Link>}
        </div>
        <div className="card text-[length:var(--text-small)] text-muted">
          <p className="font-semibold text-ink">What the desk will not do</p>
          <p className="mt-1">Give medical, legal or tax advice, or pay or file anything without your approval.</p>
        </div>
      </aside>
    </div>
  );
}
