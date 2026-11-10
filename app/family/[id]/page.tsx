import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { OverviewBand, RequestTable, StatCards } from "@/components/HomeOverview";
import { OwnerConsentForm } from "@/components/OwnerConsentForm";
import { BandSkeleton, PanelSkeleton } from "@/components/Skeletons";
import { Timeline } from "@/components/Timeline";
import { Empty, PageHeader, Panel } from "@/components/ui";
import { getViewer, isDemoMode } from "@/lib/auth";
import { OWNER_CONSENT_TEXT, REQUIRED_PURPOSES } from "@/lib/consent";
import { preferencesFor } from "@/lib/family-members";
import { fmtDate, inr } from "@/lib/format";
import { consentsFor } from "@/lib/onboarding";
import { greetingFor, isOpenStatus, STATUS_META } from "@/lib/request-engine";
import { familyAccess, propertiesFor, quotesForFamily, requestsFor, type FamilyAccess } from "@/lib/service-requests";
import { IndiaClock } from "@/components/IndiaClock";
import { deskChat } from "@/lib/contact";
import { approvalsFor, claimsFor, documentsFor, getCoordinator, getFamily, tasksFor, timeline } from "@/lib/store";
import type { Family } from "@/lib/types";
import { PURPOSES } from "@/lib/upload-rules";
import { calendarFor, deadlinesFor } from "@/lib/workspace";
import { buildAttention, daysBetween, istDate } from "@/lib/workspace-rules";

type Ctx = { id: string; base: string; access: FamilyAccess; fam: Family; today: string };

/** Everything the top of Home needs, read once per request and shared by the band and the attention list. */
const summaryFor = cache(async function summaryFor(id: string, today: string) {
  const [fam, access] = await Promise.all([getFamily(id), familyAccess(id)]);
  if (!fam) throw new Error("family missing");
  const full = access.owner || access.staff;
  const [viewer, approvals, consents, requests, quotes, docs, tasks, deadlines, calendar, coord] = await Promise.all([getViewer(), full ? approvalsFor(id) : [], consentsFor(id), access.canReadRequests ? requestsFor(id) : [], full ? quotesForFamily(id) : [], documentsFor(id), full ? tasksFor(id) : [], access.canSeeBills ? deadlinesFor(id) : [], calendarFor(id, access), access.canCreate ? null : getCoordinator(fam.coordinatorId)]);
  const ownerPending = viewer?.id === fam.owner.id && REQUIRED_PURPOSES.some((p) => !consents.find((c) => c.subject === "owner" && c.purpose === p)?.grantedAt);
  const pending = approvals.filter((a) => a.status === "pending");
  const quoted = new Set(quotes.map((q) => q.approvalId));
  const active = requests.filter((r) => isOpenStatus(r.status));
  const expiring = docs.filter((d) => d.expiresOn && daysBetween(today, d.expiresOn) <= 60);
  const upcoming = calendar.filter((c) => c.date >= today && daysBetween(today, c.date) <= 30);
  const overdue = deadlines.filter((d) => d.status === "upcoming" && d.dueOn < today).length;
  const waitingOnYou = requests.filter((r) => r.status === "awaiting_information" || r.status === "awaiting_customer" || r.status === "awaiting_approval").length;
  const attention = buildAttention({
    today, consentPending: ownerPending,
    quotes: quotes.filter((q) => q.status === "sent").map((q) => ({ id: q.id, requestId: q.requestId, title: q.requestTitle ?? q.requestRef ?? "Quotation", totalWords: inr(q.totalInr), deadline: q.approvalDeadline })),
    approvals: pending.filter((a) => !quoted.has(a.id)).map((a) => ({ id: a.id, summary: a.summary })),
    awaiting: requests.filter((r) => r.status === "awaiting_information" || r.status === "awaiting_customer").map((r) => ({ id: r.id, ref: r.ref, title: r.title, status: r.status })),
    deadlines: deadlines.filter((d) => d.status === "upcoming").map((d) => ({ id: d.id, title: d.title, dueOn: d.dueOn, reminderDays: d.reminderDays, reminderOn: d.reminderOn })),
    documents: expiring.map((d) => ({ id: d.id, title: d.title, expiresOn: d.expiresOn! })),
    waitingTasks: tasks.filter((t) => t.status === "waiting_owner" && !requests.some((r) => r.taskId === t.id)).map((t) => ({ id: t.id, title: t.title })),
  });
  return { access, fam, attention, active, pending, upcoming, overdue, waitingOnYou, expiring, calendar, coord, ownerPending };
});

/** The band and the four numbers. The first thing worth reading, so it streams first. */
async function Summary({ id, base, today }: Ctx) {
  const [{ access, attention, active, pending, upcoming, overdue, waitingOnYou, expiring, calendar, coord, ownerPending, fam }, properties] = await Promise.all([summaryFor(id, today), propertiesFor(id).catch(() => [])]);
  const top = attention[0];
  return (
    <>
      <OverviewBand base={base} today={today} attention={attention.length} top={top ? { text: top.detail, href: base + top.href } : null} calendar={calendar} canCreate={access.canCreate} coordinator={coord ? { name: coord.name, city: coord.city ?? null } : null} place={properties[0] ? { name: properties[0].name, city: properties[0].city } : null} city={fam.parent.city} />
      <StatCards cards={[
        { label: "Active requests", value: active.length, href: `${base}/requests`, icon: "list", sub: waitingOnYou ? `${waitingOnYou} waiting on you` : "All moving", tone: waitingOnYou ? undefined : "ok", go: "See all" },
        { label: "Needs your approval", value: pending.length, href: `${base}/requests?show=waiting`, icon: "check", sub: pending.length ? "Nothing starts until you decide" : "Nothing to decide", tone: pending.length ? "danger" : undefined },
        { label: "Upcoming deadlines", value: upcoming.length, href: `${base}/bills`, icon: "calendar", sub: overdue ? `${overdue} overdue` : "In the next 30 days", tone: overdue ? "danger" : undefined },
        { label: "Documents needing attention", value: expiring.length, href: `${base}/documents`, icon: "doc", sub: expiring.length ? "Expire within 60 days" : "All in date", tone: expiring.length ? "danger" : undefined },
      ]} />
      {ownerPending && <OwnerConsentForm familyId={id} items={PURPOSES.map((p) => ({ purpose: p, text: OWNER_CONSENT_TEXT[p] }))} />}
    </>
  );
}

async function Attention({ id, base, today }: Ctx) {
  const { attention } = await summaryFor(id, today);
  return (
    <>
      <Panel className="scroll-mt-24" id="attention" title="Needs your attention" action={<span className="flex items-center gap-2 text-[length:var(--text-small)] text-muted"><span aria-hidden className="orb" data-tone={attention.length ? "warn" : "ok"} />{attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"}` : "All on track"}</span>}>
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

async function Requests({ id, base, access }: Ctx) {
  const full = access.owner || access.staff;
  const [requests, quotes] = await Promise.all([access.canReadRequests ? requestsFor(id) : [], full ? quotesForFamily(id) : []]);
  const shown = [...requests.filter((r) => isOpenStatus(r.status)), ...requests.filter((r) => !isOpenStatus(r.status))].slice(0, 6);
  if (!access.canReadRequests || shown.length === 0) return null;
  return (
    <section aria-labelledby="your-requests" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="your-requests" className="text-[length:var(--text-h2)] font-semibold">Your requests</h2>
        <Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`${base}/requests`}>See all {requests.length}</Link>
      </div>
      <RequestTable base={`${base}/requests`} requests={shown} quotes={quotes} />
    </section>
  );
}

async function Work({ id, base, access }: Ctx) {
  const full = access.owner || access.staff;
  const [requests, events, claims, docs, properties] = await Promise.all([access.canReadRequests ? requestsFor(id) : [], access.canSeeActivity ? timeline(id) : [], full ? claimsFor(id) : [], documentsFor(id), access.canReadRequests ? propertiesFor(id) : []]);
  const openClaims = claims.filter((c) => c.status === "query" || c.missing.length > 0);
  const isEmpty = requests.length === 0 && docs.length === 0 && properties.length === 0;
  return (
    <>
      {isEmpty && full && (
        <Empty title="Your home page fills up with your real requests, documents and dates." action={<div className="flex flex-wrap gap-2"><Link className="btn btn-secondary" href={`${base}/requests/new`}>Make your first request</Link><Link className="btn btn-secondary" href={`${base}/documents`}>Upload a document</Link><Link className="btn btn-secondary" href={`${base}/details`}>Add family and addresses</Link></div>}>
          Nothing here is made up. Start with whatever needs handling first.
        </Empty>
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
            <a className="btn btn-secondary w-fit" href={deskChat(`Hi ${coord.name.split(" ")[0]}, I have a question about my Ally account.`)} target="_blank" rel="noopener noreferrer">Message {coord.name.split(" ")[0]} on WhatsApp</a>
          </div>
        ) : (
          <div className="grid gap-2 text-[length:var(--text-small)]">
            <p className="text-muted">We are assigning a person to you.</p>
            <a className="btn btn-secondary w-fit" href={deskChat("Hi Ally, I have a question about my account.")} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>
          </div>
        )}
      </Panel>
      {!fam.parent.isSelf && (
        <Panel title={fam.parent.name} action={<span className="chip" data-tone={consent.tone}>{consent.label}</span>}>
          <p className="text-[length:var(--text-small)] text-muted">{fam.parent.city} · speaks {fam.parent.language}. They only use WhatsApp. No app, no login.</p>
          {isDemoMode() && <Link className="btn btn-secondary w-fit" href={`/chat/${id}`}>See their WhatsApp view</Link>}
        </Panel>
      )}
      <Panel title="Upcoming" action={access.canSeeBills ? <Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`${base}/bills`}>Bills and dates</Link> : undefined}>
        <ul className="rows">
          {calendar.filter((c) => c.date >= today).slice(0, 5).map((c, n) => <li key={`${c.date}-${n}`}><Link href={c.href} className="row-link text-[length:var(--text-small)]"><span className="min-w-0 font-medium [overflow-wrap:anywhere]">{c.label}<span className="block text-[length:var(--text-micro)] font-normal text-muted">{c.kind}</span></span><span className="shrink-0 tabular-nums text-muted">{fmtDate(c.date)}</span></Link></li>)}
          {calendar.every((c) => c.date < today) && <li className="py-2 text-[length:var(--text-small)] text-muted">Nothing coming up.</li>}
        </ul>
      </Panel>
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
      <PageHeader title={`Good ${greetingFor(new Date(), prefs?.timezone)}${firstName ? `, ${firstName}` : ""}.`} sub="Here's what's happening back home.">
        {access.canCreate && <Link className="btn btn-primary max-sm:hidden" href={`${base}/requests/new`}>Tell Ally what you need</Link>}
      </PageHeader>
      <Suspense fallback={<BandSkeleton />}><Summary {...ctx} /></Suspense>
      <Suspense fallback={<PanelSkeleton rows={4} />}><Requests {...ctx} /></Suspense>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-5">
          <Suspense fallback={<PanelSkeleton rows={3} />}><Attention {...ctx} /></Suspense>
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
