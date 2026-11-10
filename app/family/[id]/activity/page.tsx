import { notFound } from "next/navigation";
import { Timeline } from "@/components/Timeline";
import { Empty, PageHeader, Panel, Tabs } from "@/components/ui";
import { familyAccess } from "@/lib/service-requests";
import { timeline } from "@/lib/store";
import type { TimelineEvent } from "@/lib/types";

export const metadata = { title: "Reports & Activity" };
const KINDS: [TimelineEvent["kind"], string][] = [["document", "Documents"], ["approval", "Approvals"], ["visit", "Visits"], ["bill", "Bills"], ["message", "Messages"], ["claim", "Claims"], ["system", "Desk"]];

export default async function Activity({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string; from?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const access = await familyAccess(id);
  if (!access.canSeeActivity) notFound();
  const all = await timeline(id);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : "";
  const events = all.filter((e) => (!sp.kind || e.kind === sp.kind) && (!from || e.at.slice(0, 10) >= from));
  const base = `/family/${id}`;
  const full = access.owner || access.staff;
  return (
    <section className="grid gap-5">
      <PageHeader title="Reports & Activity" />
      {full && <Tabs items={[{ href: `${base}/activity`, label: "Activity", active: true }, { href: `${base}/report`, label: "Monthly report", active: false }, { href: `${base}/privacy`, label: "Access log", active: false }]} />}
      <form className="flex flex-wrap items-end gap-2" aria-label="Filter activity">
        <label className="field">Kind<select className="input" name="kind" defaultValue={sp.kind ?? ""}><option value="">Everything</option>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field">From<input className="input" type="date" name="from" defaultValue={from} /></label>
        <button className="btn btn-secondary">Apply</button>
      </form>
      {events.length === 0 ? <Empty title="Nothing to show.">Updates appear here as work happens on your account.</Empty> : <Panel><Timeline events={events} /></Panel>}
    </section>
  );
}
