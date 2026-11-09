import Link from "next/link";
import { notFound } from "next/navigation";
import { IndiaClock } from "@/components/IndiaClock";
import { OwnerConsentForm } from "@/components/OwnerConsentForm";
import { Timeline } from "@/components/Timeline";
import { getViewer, isDemoMode } from "@/lib/auth";
import { OWNER_CONSENT_TEXT, REQUIRED_PURPOSES } from "@/lib/consent";
import { preferencesFor } from "@/lib/family-members";
import { consentsFor } from "@/lib/onboarding";
import { buildBriefing, greetingFor, isOpenStatus } from "@/lib/request-engine";
import { familyAccess, propertiesFor, quotesForFamily, requestsFor } from "@/lib/service-requests";
import { approvalsFor, claimsFor, documentsFor, getFamily, policyFor, tasksFor, timeline } from "@/lib/store";
import { PURPOSES } from "@/lib/upload-rules";
import { monthStartIst } from "@/lib/rules";

const CONSENT = {
  granted: { label: "Consent on file", tone: "ok" },
  pending: { label: "Waiting for the consent call", tone: "warn" },
  withdrawn: { label: "Consent withdrawn", tone: "danger" },
} as const;

const iso = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00+05:30` : null);

function Stat({ href, label, value, tone }: { href: string; label: string; value: number; tone?: "warn" }) {
  return (
    <Link href={href} className="card lift rise grid gap-1">
      <span className={`text-4xl font-extrabold tabular-nums tracking-tight ${tone && value > 0 ? "text-warn" : ""}`}>{value}</span>
      <span className="text-[length:var(--text-small)] text-muted">{label}</span>
    </Link>
  );
}

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const viewer = await getViewer();
  const [approvals, claims, events, consents, requests, quotes, docs, tasks, policy, properties, access, prefs] = await Promise.all([approvalsFor(id), claimsFor(id), timeline(id), consentsFor(id), requestsFor(id), quotesForFamily(id), documentsFor(id), tasksFor(id), policyFor(id), propertiesFor(id), familyAccess(id), viewer ? preferencesFor(viewer.id) : null]);
  const now = new Date();
  const pending = approvals.filter((a) => a.status === "pending");
  const open = claims.filter((c) => c.status === "query" || c.missing.length > 0);
  const ownerPending = viewer?.id === fam.owner.id && REQUIRED_PURPOSES.some((p) => !consents.find((c) => c.subject === "owner" && c.purpose === p)?.grantedAt);
  const needs = pending.length + (ownerPending ? 1 : 0);
  const headline = needs === 0 ? "All on track" : `${needs} thing${needs === 1 ? "" : "s"} need${needs === 1 ? "s" : ""} you`;
  const c = CONSENT[fam.parent.consentStatus];

  const active = requests.filter((r) => isOpenStatus(r.status));
  const monthStart = monthStartIst(now);
  const doneThisMonth = requests.filter((r) => r.completedAt && new Date(r.completedAt) >= monthStart).length;
  const unpaid = quotes.filter((q) => q.status === "approved" && active.some((r) => r.id === q.requestId)).length;
  const expiring = docs.flatMap((d) => {
    const at = iso(d.extracted["Renewal date"] ?? d.extracted["Expiry date"]);
    return at ? [{ title: d.title, at }] : [];
  });
  const deadlines = [
    ...tasks.filter((t) => t.status !== "done" && t.dueAt && (t.kind === "bill" || t.kind === "renewal")).map((t) => ({ label: t.title, at: t.dueAt })),
    ...docs.flatMap((d) => {
      const at = d.kind === "bill" ? iso(d.extracted["Due date"]) : null;
      return at ? [{ label: `Bill from ${d.extracted["Bill payee"] ?? d.title}`, at }] : [];
    }),
    ...(policy?.renewalDate ? [{ label: `${policy.insurer} policy renewal`, at: policy.renewalDate }] : []),
  ];
  const soonCount = deadlines.filter((d) => new Date(d.at).getTime() - now.getTime() < 30 * 86_400_000).length;
  const expiringCount = expiring.filter((d) => new Date(d.at).getTime() - now.getTime() < 60 * 86_400_000).length;
  const briefing = buildBriefing({ now, approvals: pending, awaitingInfo: requests.filter((r) => r.status === "awaiting_information"), deadlines, expiring, completedThisMonth: doneThisMonth, ownerConsentPending: ownerPending });
  const isEmpty = requests.length === 0 && docs.length === 0 && properties.length === 0;
  const base = `/family/${id}`;
  const firstName = (viewer?.name ?? "").split(/\s+/)[0];
  const full = access.owner || access.staff;
  const quick = [
    ...(access.canCreate ? [{ href: `${base}/requests/new`, label: "Create a request" }] : []),
    ...(access.canUpload ? [{ href: `${base}/documents`, label: "Upload a document" }] : []),
    ...(full ? [{ href: `${base}/properties`, label: "Add a property" }] : []),
    ...(access.owner ? [{ href: `${base}/people`, label: "Add a family member" }] : []),
    ...(full ? [{ href: `${base}/approvals`, label: "Review approvals" }, { href: `${base}/ask`, label: "Ask Ally AI" }] : []),
  ];

  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-[length:var(--text-h1)] font-extrabold">Good {greetingFor(now, prefs?.timezone)}{firstName ? `, ${firstName}` : ""}.</h1>
        <p className="mt-1 text-muted">Here&apos;s everything happening back home.</p>
      </header>

      {access.canReadRequests && (
        <section aria-label="At a glance" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Stat href={`${base}/requests`} label="Active requests" value={active.length} />
          {full && <Stat href={`${base}/approvals`} label="Waiting for your approval" value={pending.length} tone="warn" />}
          {full && <Stat href={`${base}/calendar`} label="Deadlines in 30 days" value={soonCount} tone="warn" />}
          <Stat href={`${base}/documents`} label="Documents expiring soon" value={expiringCount} tone="warn" />
          <Stat href={`${base}/properties`} label="Properties and assets" value={properties.length} />
          {full && <Stat href={`${base}/approvals`} label="Approved, not yet paid" value={unpaid} />}
          <Stat href={`${base}/requests`} label="Completed this month" value={doneThisMonth} />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="status" className="grid content-start gap-4">
          <div>
            <h2 id="status" className="flex items-center gap-3 text-[length:var(--text-h2)] font-bold"><span aria-hidden className="orb" data-tone={needs === 0 ? "ok" : "warn"} />{headline}</h2>
            <p className="mt-1 text-muted">{fam.parent.isSelf ? (fam.parent.city ? `Your work in ${fam.parent.city}` : "Your account") : `for ${fam.parent.name} in ${fam.parent.city}`}</p>
          </div>
          {ownerPending && <OwnerConsentForm familyId={id} items={PURPOSES.map((p) => ({ purpose: p, text: OWNER_CONSENT_TEXT[p] }))} />}

          <div className="card grid gap-3">
            <h2 className="text-[length:var(--text-h3)] font-semibold">Your Ally Briefing</h2>
            {briefing.length > 0 ? (
              <ol className="grid gap-2">
                {briefing.map((b) => <li key={b.text}><Link className="flex min-h-12 items-center gap-3 rounded-xl bg-tint px-3 py-2 font-medium" href={base + b.section}>{b.text}</Link></li>)}
              </ol>
            ) : (
              <p className="text-muted">Nothing needs you right now. Items appear here when a request, a document or a deadline needs your attention.</p>
            )}
          </div>

          {pending.length > 0 && (
            <Link href={`${base}/approvals`} className="card lift flex items-center justify-between gap-3" style={{ borderColor: "var(--warn)" }}>
              <span><span className="font-semibold">Needs you:</span> {pending[0].summary}</span>
              <span className="btn btn-primary">Review</span>
            </Link>
          )}
          {open.length > 0 && (
            <div className="card">
              <p className="font-semibold">Open claim: {open[0].hospital}</p>
              <p className="text-muted">Still missing: {open[0].missing.join(", ") || "nothing"}.</p>
              <Link className="btn btn-ghost mt-2" href={`${base}/claims`}>See claim</Link>
            </div>
          )}

          {isEmpty && full && (
            <div className="card grid gap-3">
              <h2 className="text-[length:var(--text-h3)] font-semibold">Start here</h2>
              <p className="text-muted">Your dashboard fills up with your real requests, documents and dates. Pick one to begin.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link className="btn btn-secondary" href={`${base}/documents`}>Upload your first document</Link>
                <Link className="btn btn-secondary" href={`${base}/properties`}>Add your first property</Link>
                {access.owner && <Link className="btn btn-secondary" href={`${base}/people`}>Invite a family member</Link>}
                <Link className="btn btn-secondary" href={`${base}/requests/new`}>Submit your first request</Link>
              </div>
            </div>
          )}

          {(full || access.canSeeActivity) && (
            <>
              <h2 className="mt-2 text-[length:var(--text-h2)] font-bold">What is happening</h2>
              <Timeline events={events.slice(0, 12)} />
            </>
          )}
        </section>

        <aside className="grid content-start gap-4" aria-label="Who this is for">
          {quick.length > 0 && (
            <div className="card grid gap-2">
              <h2 className="text-[length:var(--text-h3)] font-semibold">Quick actions</h2>
              {quick.map((q) => <Link key={q.label} href={q.href} className="flex min-h-12 items-center font-medium text-accent underline-offset-4 hover:underline">{q.label}</Link>)}
            </div>
          )}
          <IndiaClock city={fam.parent.city || "India"} />
          <div className="card grid gap-1">
            <p className="text-[length:var(--text-h3)] font-semibold">{fam.parent.isSelf ? "Where we are working" : fam.parent.name}</p>
            <p className="text-muted">{fam.parent.city || "Tell us in Settings"}{fam.parent.isSelf ? "" : ` · speaks ${fam.parent.language}`}</p>
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
    </div>
  );
}
