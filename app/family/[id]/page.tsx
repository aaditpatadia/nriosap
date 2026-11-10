import Link from "next/link";
import { notFound } from "next/navigation";
import { IndiaClock } from "@/components/IndiaClock";
import { MiniCalendar } from "@/components/MiniCalendar";
import { OwnerConsentForm } from "@/components/OwnerConsentForm";
import { Timeline } from "@/components/Timeline";
import { Empty, Metric, PageHeader, Panel } from "@/components/ui";
import { getViewer, isDemoMode } from "@/lib/auth";
import { OWNER_CONSENT_TEXT, REQUIRED_PURPOSES } from "@/lib/consent";
import { membersFor, preferencesFor } from "@/lib/family-members";
import { inr } from "@/lib/format";
import { consentsFor } from "@/lib/onboarding";
import { greetingFor, isOpenStatus } from "@/lib/request-engine";
import { familyAccess, quotesForFamily, requestsFor } from "@/lib/service-requests";
import { approvalsFor, getCoordinator, getFamily, timeline } from "@/lib/store";
import { PURPOSES } from "@/lib/upload-rules";
import { calendarFor, claimsOnce, deadlinesOnce, documentsOnce, propertiesOnce, tasksOnce } from "@/lib/workspace";
import { buildAttention, daysBetween, istDate } from "@/lib/workspace-rules";

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const viewer = await getViewer();
  const access = await familyAccess(id);
  const full = access.owner || access.staff;
  const [claims, approvals, events, consents, requests, quotes, docs, tasks, properties, prefs, members, calendar, deadlines, coord] = await Promise.all([full ? claimsOnce(id) : [], full ? approvalsFor(id) : [], access.canSeeActivity ? timeline(id) : [], consentsFor(id), access.canReadRequests ? requestsFor(id) : [], full ? quotesForFamily(id) : [], documentsOnce(id), full ? tasksOnce(id) : [], access.canReadRequests ? propertiesOnce(id) : [], viewer ? preferencesFor(viewer.id) : null, access.owner ? membersFor(id) : [], calendarFor(id, access), access.canSeeBills ? deadlinesOnce(id) : [], getCoordinator(fam.coordinatorId)]);
  const now = new Date();
  const today = istDate(now);
  const base = `/family/${id}`;
  const pending = approvals.filter((a) => a.status === "pending");
  const ownerPending = viewer?.id === fam.owner.id && REQUIRED_PURPOSES.some((p) => !consents.find((c) => c.subject === "owner" && c.purpose === p)?.grantedAt);
  const active = requests.filter((r) => isOpenStatus(r.status));
  const waitingQuotes = quotes.filter((q) => q.status === "sent");
  const quoted = new Set(quotes.map((q) => q.approvalId));
  const open = deadlines.filter((d) => d.status === "upcoming");
  const expiring = docs.filter((d) => d.expiresOn && daysBetween(today, d.expiresOn) <= 60);
  const upcoming = calendar.filter((c) => c.date >= today && daysBetween(today, c.date) <= 30);
  const updatesThisWeek = events.filter((e) => now.getTime() - new Date(e.at).getTime() < 7 * 86_400_000).length;
  const attention = buildAttention({
    today, consentPending: ownerPending,
    quotes: waitingQuotes.map((q) => ({ id: q.id, requestId: q.requestId, title: q.requestTitle ?? q.requestRef ?? "Quotation", totalWords: inr(q.totalInr), deadline: q.approvalDeadline })),
    approvals: pending.filter((a) => !quoted.has(a.id)).map((a) => ({ id: a.id, summary: a.summary })),
    awaiting: requests.filter((r) => r.status === "awaiting_information" || r.status === "awaiting_customer").map((r) => ({ id: r.id, ref: r.ref, title: r.title, status: r.status })),
    deadlines: open.map((d) => ({ id: d.id, title: d.title, dueOn: d.dueOn, reminderDays: d.reminderDays, reminderOn: d.reminderOn })),
    documents: expiring.map((d) => ({ id: d.id, title: d.title, expiresOn: d.expiresOn! })),
    waitingTasks: tasks.filter((t) => t.status === "waiting_owner" && !requests.some((r) => r.taskId === t.id)).map((t) => ({ id: t.id, title: t.title })),
  });
  const openClaims = claims.filter((c) => c.status === "query" || c.missing.length > 0);
  const CONSENT = { granted: { label: "Consent on file", tone: "ok" }, pending: { label: "Waiting for the consent call", tone: "warn" }, withdrawn: { label: "Consent withdrawn", tone: "danger" } } as const;
  const consent = CONSENT[fam.parent.consentStatus];
  const firstName = (viewer?.name ?? "").split(/\s+/)[0];
  const isEmpty = requests.length === 0 && docs.length === 0 && properties.length === 0;
  const latest = events.find((e) => e.actor === "human");
  const coordOpen = active.filter((r) => r.coordinatorId === fam.coordinatorId).length;
  const quick = [
    ...(access.canCreate ? [{ href: `${base}/requests/new`, label: "Create a request" }] : []),
    ...(access.canUpload ? [{ href: `${base}/documents`, label: "Upload a document" }] : []),
    ...(full ? [{ href: `${base}/properties`, label: "Add a property" }] : []),
    ...(access.owner ? [{ href: `${base}/people`, label: "Invite a family member" }] : []),
    ...(access.canManageBills ? [{ href: `${base}/bills`, label: "Add a bill" }] : []),
  ];
  return (
    <div className="grid gap-6">
      <PageHeader title={`Good ${greetingFor(now, prefs?.timezone)}${firstName ? `, ${firstName}` : ""}.`} sub="Here's what is happening back home." />
      {access.canReadRequests && (
        <section aria-label="Your India at a glance" className="metric-strip" data-cols="4">
          <Metric href={`${base}/requests`} label="Active requests" value={active.length} />
          {full && <Metric href={`${base}/approvals`} label="Pending approvals" value={pending.length} alert />}
          {access.canSeeBills && <Metric href={`${base}/bills`} label="Deadlines in 30 days" value={upcoming.length} alert />}
          {access.canSeeVault && <Metric href={`${base}/documents`} label="Documents needing attention" value={expiring.length} alert />}
          {access.canSeeVault && <Metric href={`${base}/documents`} label="Documents stored" value={docs.length} />}
          <Metric href={`${base}/properties`} label="Properties" value={properties.length} />
          {access.owner && <Metric href={`${base}/people`} label="Family connected" value={members.length} />}
          {access.canSeeActivity && <Metric href={`${base}/activity`} label="Updates this week" value={updatesThisWeek} />}
        </section>
      )}
      {ownerPending && <OwnerConsentForm familyId={id} items={PURPOSES.map((p) => ({ purpose: p, text: OWNER_CONSENT_TEXT[p] }))} />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-5">
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

          {openClaims.map((c) => <Panel key={c.id} title={`Open claim: ${c.hospital}`} action={<Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`${base}/claims`}>See claim</Link>}><p className="text-[length:var(--text-small)] text-muted">Still missing: {c.missing.join(", ") || "nothing"}.</p></Panel>)}

          {isEmpty && full && (
            <Empty title="Your dashboard fills up with your real requests, documents and dates." action={<div className="flex flex-wrap gap-2"><Link className="btn btn-secondary" href={`${base}/requests/new`}>Submit your first request</Link><Link className="btn btn-secondary" href={`${base}/documents`}>Upload your first document</Link><Link className="btn btn-secondary" href={`${base}/properties`}>Add your first property</Link>{access.owner && <Link className="btn btn-secondary" href={`${base}/people`}>Invite a family member</Link>}</div>}>
              Nothing here is made up. Pick one to begin.
            </Empty>
          )}

          {(full || access.canSeeActivity) && <Panel title="Recent activity" action={<Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`${base}/activity`}>See all</Link>}><Timeline events={events.slice(0, 10)} /></Panel>}
        </div>

        <aside className="grid content-start gap-5" aria-label="Your coordinator and calendar">
          <Panel title="Your Ally coordinator">
            {coord ? (
              <div className="grid gap-2 text-[length:var(--text-small)]">
                <p className="text-[length:var(--text-h3)] font-semibold">{coord.name}</p>
                <p className="text-muted">{coord.city ? `Based in ${coord.city}` : "Based in India"}{coord.workingHours ? `. ${coord.workingHours}` : ""}</p>
                {access.canReadRequests && <p className="text-muted">Working on {coordOpen} of your request{coordOpen === 1 ? "" : "s"}.</p>}
                {latest && <p className="text-muted [overflow-wrap:anywhere]">Latest: {latest.text}</p>}
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
          <Panel title="Upcoming"><MiniCalendar items={calendar} today={today} /></Panel>
          {quick.length > 0 && <Panel title="Quick actions"><ul className="rows">{quick.map((q) => <li key={q.label}><Link href={q.href} className="row-link font-medium">{q.label}<span aria-hidden className="text-muted">›</span></Link></li>)}</ul></Panel>}
          <IndiaClock city={fam.parent.city || "India"} />
        </aside>
      </div>
    </div>
  );
}
