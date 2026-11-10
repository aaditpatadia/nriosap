import Link from "next/link";
import { notFound } from "next/navigation";
import { PreferencesForm } from "@/components/PreferencesForm";
import { PageHeader, Panel } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { membersFor, preferencesFor } from "@/lib/family-members";
import { RELATIONS } from "@/lib/request-engine";
import { familyAccess, propertiesFor } from "@/lib/service-requests";
import { getFamily } from "@/lib/store";
import { deadlinesFor } from "@/lib/workspace";
import { daysBetween, istDate, MEMBER_ROLES, whenWords } from "@/lib/workspace-rules";

export const metadata = { title: "Family & Details" };

const STATUS: Record<string, string> = { contact: "Contact, no login", invited: "Invitation sent", active: "Has access" };

export default async function Details({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [viewer, access, fam] = await Promise.all([getViewer(), familyAccess(id), getFamily(id)]);
  if (!viewer || !fam) notFound();
  const [prefs, members, properties, deadlines] = await Promise.all([preferencesFor(viewer.id), access.owner ? membersFor(id) : [], access.canReadRequests ? propertiesFor(id) : [], access.canSeeBills ? deadlinesFor(id) : []]);
  const base = `/family/${id}`;
  const today = istDate(new Date());
  const next = deadlines.filter((d) => d.status === "upcoming").slice(0, 4);
  return (
    <section className="grid gap-5">
      <PageHeader title="Family & Details" sub="Who is involved, where things are, and how we reach you. Nobody sees anyone else's private information unless it is shared with them." />
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <div className="grid gap-5">
          {access.owner && (
            <Panel title="Family contacts" action={<Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`${base}/people`}>Manage</Link>}>
              {members.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">Nobody added yet. Relatives can be a WhatsApp contact with no app and no login.</p> : (
                <ul className="rows">{members.map((m) => <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[length:var(--text-small)]"><span className="min-w-0"><span className="block font-medium">{m.name}</span><span className="block text-muted">{RELATIONS[m.relation]}{m.status !== "contact" ? ` · ${MEMBER_ROLES[m.role].label}` : ""}{m.location ? ` · ${m.location}` : ""}</span></span><span className="chip">{STATUS[m.status] ?? m.status}</span></li>)}</ul>
              )}
              <Link className="btn btn-secondary w-fit" href={`${base}/people`}>Add a family member</Link>
            </Panel>
          )}
          {access.canReadRequests && (
            <Panel title="Addresses and properties" action={<Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`${base}/properties`}>Manage</Link>}>
              {properties.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">No addresses yet. Add a flat, house or other property, and link requests and bills to it.</p> : (
                <ul className="rows">{properties.map((p) => <li key={p.id}><Link className="row-link text-[length:var(--text-small)]" href={`${base}/properties/${p.id}`}><span className="min-w-0"><span className="block font-medium [overflow-wrap:anywhere]">{p.name}</span><span className="block text-muted [overflow-wrap:anywhere]">{[p.address, p.city].filter(Boolean).join(", ") || "No address yet"}</span></span><span aria-hidden className="text-muted">›</span></Link></li>)}</ul>
              )}
            </Panel>
          )}
          {access.canSeeBills && (
            <Panel title="Bills and important dates" action={<Link className="text-[length:var(--text-small)] font-semibold text-accent" href={`${base}/bills`}>Manage</Link>}>
              {next.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">Nothing coming up. Add property tax, society dues, rent agreements and insurance renewals to be reminded.</p> : <ul className="rows">{next.map((d) => <li key={d.id} className="flex justify-between gap-3 py-2 text-[length:var(--text-small)]"><span className="font-medium [overflow-wrap:anywhere]">{d.title}</span><span className="shrink-0 text-muted">{whenWords(daysBetween(today, d.dueOn))}</span></li>)}</ul>}
            </Panel>
          )}
        </div>
        <div className="grid gap-5">
          <PreferencesForm prefs={prefs} />
          {(access.owner || access.staff) && (
            <Panel title="Consent and permissions">
              <p className="text-[length:var(--text-small)] text-muted">{fam.parent.isSelf ? "Your consents decide what Ally may do with your documents." : `${fam.parent.name}'s consent was recorded on a call, in their own language.`} You can see who opened each document, and withdraw consent at any time.</p>
              <Link className="btn btn-secondary w-fit" href={`${base}/privacy`}>Consent, access log and your data</Link>
            </Panel>
          )}
        </div>
      </div>
    </section>
  );
}
