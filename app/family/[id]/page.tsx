import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MiniCalendar } from "@/components/MiniCalendar";
import { OwnerConsentForm } from "@/components/OwnerConsentForm";
import { MetricsSkeleton, PanelSkeleton } from "@/components/Skeletons";
import { Timeline } from "@/components/Timeline";
import { Empty, Metric, PageHeader, Panel } from "@/components/ui";
import { getViewer, isDemoMode } from "@/lib/auth";
import { OWNER_CONSENT_TEXT, REQUIRED_PURPOSES } from "@/lib/consent";
import { preferencesFor } from "@/lib/family-members";
import { fmtDate, inr } from "@/lib/format";
import { consentsFor } from "@/lib/onboarding";
import { greetingFor, isOpenStatus, STATUS_META } from "@/lib/request-engine";
import { familyAccess, propertiesFor, quotesForFamily, requestsFor, type FamilyAccess } from "@/lib/service-requests";
import { IndiaClock } from "@/components/IndiaClock";
import { approvalsFor, claimsFor, documentsFor, getCoordinator, getFamily, tasksFor, timeline } from "@/lib/store";
import type { Family } from "@/lib/types";
import { PURPOSES } from "@/lib/upload-rules";
import { calendarFor, deadlinesFor } from "@/lib/workspace";
import { buildAttention, daysBetween, istDate } from "@/lib/workspace-rules";

type Ctx = { id: string; base: string; access: FamilyAccess; fam: Family; today: string };

/** The four numbers and what needs the customer. The first thing worth reading, so it streams first. */
async function Summary({ id, base, access, fam, today }: Ctx) {
  const full = access.owner || access.staff;
  const [viewer, approvals, consents, requests, quotes, docs, tasks, deadlines, calendar] = await Promise.all([getViewer(), full ? approvalsFor(id) : [], consentsFor(id), access.canReadRequests ? requestsFor(id) : [], full ? quotesForFamily(id) : [], documentsFor(id), full ? tasksFor(id) : [], access.canSeeBills ? deadlinesFor(id) : [], calendarFor(id, access)]);
  const ownerPending = viewer?.id === fam.owner.id && REQUIRED_PURPOSES.some((p) => !consents.find((c) => c.subject === "owner" && c.purpose === p)?.grantedAt);
  const pending = approvals.filter((a) => a.status === "pending");
  const quoted = new Set(quotes.map((q) => q.approvalId));
  const active = requests.filter((r) => isOpenStatus(r.status));
  const expiring = docs.filter((d) => d.expiresOn && daysBetween(today, d.expiresOn) <= 60);
  const upcoming = calendar.filter((c) => c.date >= today && daysBetween(today, c.date) <= 30);
  const attention = buildAttention({
    today, consentPending: ownerPending,
    quotes: quotes.filter((q) => q.status === "sent").map((q) => ({ id: q.id, requestId: q.requestId, title: q.requestTitle ?? q.requestRef ?? "Quotation", totalWords: inr(q.totalInr), deadline: q.approvalDeadline })),
    approvals: pending.filter((a) => !quoted.has(a.id)).map((a) => ({ id: a.id, summary: a.summary })),
    awaiting: requests.filter((r) => r.status === "awaiting_information" || r.status === "awaiting_customer").map((r) => ({ id: r.id, ref: r.ref, title: r.title, status: r.status })),
    deadlines: deadlines.filter((d) => d.status === "upcoming").map((d) => ({ id: d.id, title: d.title, dueOn: d.dueOn, reminderDays: d.reminderDays, reminderOn: d.reminderOn })),
    documents: expiring.map((d) => ({ id: d.id, title: d.title, expiresOn: d.expiresOn! })),
    waitingTasks: tasks.filter((t) => t.status === "waiting_owner" && !requests.some((r) => r.taskId === t.id)).map((t) => ({ id: t.id, title: t.title })),
  });
  return (
    <>
      <section aria-label="Your summary" className="metric-strip" data-cols="4">
        <Metric href={`${base}/requests`} label="Active requests" value={active.length} />
        <Metric href={`${base}/requests?show=waiting`} label="Needs your approval" value={pending.length} alert />
        <Metric href={`${base}/bills`} label="Upcoming deadlines" value={upcoming.length} alert />
        <Metric href={`${base}/documents`} label="Documents needing attention" value={expiring.length} alert />
      </section>
      {ownerPending && <OwnerConsentForm familyId={id} items={PURPOSES.map((p) => ({ purpose: p, text: OWNER_CONSENT_TEXT[p] }))} />}
      <Panel title="Needs your attention" action={<span className="flex items-center gap-2 text-[length:var(--text-small)] text-muted"><span aria-hidden className="orb" data-tone={attention.length ? "warn" : "ok"} />{attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"}` : "All on track"}</span>}>
        {attention.length === 0 ? (
          <p className="text-[length:var(--text-small)] text-muted">Nothing needs you right now. Quotations, deadlines and questions from your coordinator appear here.</p>
        ) : (
          <ul className="rows">
            {attention.map((a) => (
              <li key={a.key}>
                <Link href={base + a.href} className="row-link">
                  <span className="flex min-w-0 items-start gap-3"><span aria-hidden className="level mt-2" data-level={a.level} /><span className="min-w-0"><span className="block font-medium [overflow-wrap:anywhere]">{a.title}</span><span className="block text-[length:var(--text-small)] text-muted [overflow-wrap:anywhere]">{a.detail}</span></span></span>
                  <span className="shrink-0 text-[length:var(--text-small)] font-semibold text-accent">{a.action}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

async function Work({ id, base, access }: Ctx) {
  const full = access.owner || access.staff;
  const [requests, events, claims, docs, properties] = await Promise.all([access.canReadRequests ? requestsFor(id) : [], access.canSeeActivity ? timeline(id) : [], full ? claimsFor(id) : [], documentsFor(id), access.canReadRequests ? propertiesFor(id) : []]);
  const active = requests.filter((r) => isOpenStatus(r.status)).slice(0, 5);
  const openClaims = claims.filter((c) => c.status === "query" || c.missing.length > 0);
  const isEmpty = requests.length === 0 && docs.length === 0 && properties.length === 0;
  return (
    <>
      {isEmpty && full && (
        <Empty title="Your home page fills up with your real requests, documents and dates." action={<div className="flex flex-wrap gap-2"><Link className="btn btn-secondary" href={`${base}/requests/new`}>Make your first request</Link><Link className="btn btn-secondary" href={`${base}/documents`}>Upload a document</Link><Link className="btn btn-secondary" href={`${base}/details`}>Add family and addresses</Link></div>}>
          Nothing here is made up. Start with whatever needs handling first.
        </Empty>
      )}
      {access.canReadRequests && active.length > 0 && (
        <Panel title="Active requests" action={<Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`${base}/requests`}>See all</Link>}>
          <ul className="rows">{active.map((r) => <li key={r.id}><Link className="row-link" href={`${base}/requests/${r.id}`}><span className="min-w-0"><span className="block font-medium [overflow-wrap:anywhere]">{r.title}</span><span className="block text-[length:var(--text-small)] text-muted">{r.ref} · {r.coordinatorName ?? "Being assigned"} · updated {fmtDate(r.updatedAt)}</span></span><span className="chip shrink-0" data-tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</span></Link></li>)}</ul>
        </Panel>
      )}
      {openClaims.map((c) => <Panel key={c.id} title={`Open claim: ${c.hospital}`} action={<Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`${base}/claims`}>See claim</Link>}><p className="text-[length:var(--text-small)] text-muted">Still missing: {c.missing.join(", ") || "nothing"}.</p></Panel>)}
      {access.canSeeActivity && <Panel title="Recent activity" action={<Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`${base}/activity`}>See all</Link>}><Timeline events={events.slice(0, 8)} /></Panel>}
    </>
  );
}

async function Side({ id, base, access, fam, today }: Ctx) {
  const [coord, calendar, requests] = await Promise.all([getCoordinator(fam.coordinatorId), calendarFor(id, access), access.canReadRequests ? requestsFor(id) : []]);
  const CONSENT = { granted: { label: "Consent on file", tone: "ok" }, pending: { label: "Waiting for the consent call", tone: "warn" }, withdrawn: { label: "Consent withdrawn", tone: "danger" } } as const;
  const consent = CONSENT[fam.parent.consentStatus];
  const working = requests.filter((r) => isOpenStatus(r.status) && r.coordinatorId === fam.coordinatorId).length;
  return (
    <>
      <Panel title="Your Ally coordinator">
        {coord ? (
          <div className="grid gap-2 text-[length:var(--text-small)]">
            <p className="text-[length:var(--text-h3)] font-semibold">{coord.name}</p>
            <p className="text-muted">{coord.city ? `Based in ${coord.city}` : "Based in India"}{coord.workingHours ? `. ${coord.workingHours}` : ""}</p>
            {access.canReadRequests && <p className="text-muted">Handling {working} of your request{working === 1 ? "" : "s"}.</p>}
            {coord.phone && <a className="btn btn-secondary w-fit" href={`https://wa.me/${coord.phone.replace(/\D/g, "")}`}>Contact {coord.name.split(" ")[0]}</a>}
          </div>
        ) : <p className="text-[length:var(--text-small)] text-muted">We are assigning a person to you.</p>}
      </Panel>
      {!fam.parent.isSelf && (
        <Panel title={fam.parent.name} action={<span className="chip" data-tone={consent.tone}>{consent.label}</span>}>
          <p className="text-[length:var(--text-small)] text-muted">{fam.parent.city} · speaks {fam.parent.language}. They only use WhatsApp. No app, no login.</p>
          {isDemoMode() && <Link className="btn btn-secondary w-fit" href={`/chat/${id}`}>See their WhatsApp view</Link>}
        </Panel>
      )}
      <Panel title="Upcoming" action={access.canSeeBills ? <Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`${base}/bills`}>Bills and dates</Link> : undefined}><MiniCalendar items={calendar} today={today} /></Panel>
      <Panel title="More for you">
        <ul className="rows">
          {[[`${base}/ask`, "Ask Ally about your records"], ...(access.owner || access.staff ? [[`${base}/report`, "This month's report"], [`${base}/approvals`, "Approvals and costs"]] : []), ...(access.canReadRequests ? [[`${base}/properties`, "Properties and addresses"]] : [])].map(([href, label]) => <li key={href}><Link href={href} className="row-link font-medium">{label}<span aria-hidden className="text-muted">›</span></Link></li>)}
        </ul>
      </Panel>
    </>
  );
}

export default async function Home({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [fam, viewer, access] = await Promise.all([getFamily(id), getViewer(), familyAccess(id)]);
  if (!fam) notFound();
  const prefs = viewer ? await preferencesFor(viewer.id) : null;
  const base = `/family/${id}`;
  const ctx: Ctx = { id, base, access, fam, today: istDate(new Date()) };
  const firstName = (viewer?.name ?? "").split(/\s+/)[0];
  return (
    <div className="grid gap-6">
      <div className="welcome">
        <PageHeader title={`Good ${greetingFor(new Date(), prefs?.timezone)}${firstName ? `, ${firstName}` : ""}.`} sub="Here's what's happening back home.">
          {access.canCreate && <Link className="btn btn-primary" href={`${base}/requests/new`}>Tell Ally what you need</Link>}
        </PageHeader>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-5">
          <Suspense fallback={<><MetricsSkeleton /><PanelSkeleton rows={3} /></>}><Summary {...ctx} /></Suspense>
          <Suspense fallback={<PanelSkeleton rows={4} />}><Work {...ctx} /></Suspense>
        </div>
        <aside className="grid content-start gap-5" aria-label="Your coordinator and calendar">
          {!fam.parent.isSelf && <IndiaClock city={fam.parent.city} />}
          <Suspense fallback={<><PanelSkeleton rows={3} title="60%" /><PanelSkeleton rows={5} title="30%" /></>}><Side {...ctx} /></Suspense>
        </aside>
      </div>
    </div>
  );
}
