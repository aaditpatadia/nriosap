import Link from "next/link";
import { notFound } from "next/navigation";
import { AddBillForm, BillActions } from "@/components/BillForms";
import { MiniCalendar } from "@/components/MiniCalendar";
import { Empty, PageHeader, Panel, Tabs } from "@/components/ui";
import { fmtDate, inr } from "@/lib/format";
import { familyAccess, propertiesFor } from "@/lib/service-requests";
import { documentsFor } from "@/lib/store";
import { calendarFor, deadlinesFor, type Deadline } from "@/lib/workspace";
import { daysBetween, DEADLINE_KINDS, istDate, RECURRENCES, whenWords } from "@/lib/workspace-rules";

export const metadata = { title: "Bills & Renewals" };

function BillRow({ d, today, canManage, base }: { d: Deadline; today: string; canManage: boolean; base: string }) {
  const days = daysBetween(today, d.dueOn);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium [overflow-wrap:anywhere]">{d.title}{d.status === "handled" ? <span className="chip" data-tone="ok">Marked handled</span> : <span className="chip" data-tone={days < 0 || days <= 7 ? "danger" : days <= 15 ? "warn" : undefined}>{whenWords(days)}</span>}</p>
        <p className="text-[length:var(--text-small)] text-muted">{DEADLINE_KINDS[d.kind]} · {fmtDate(d.dueOn)}{d.amountInr !== null ? ` · ${inr(d.amountInr)}` : ""}{d.propertyName ? ` · ${d.propertyName}` : ""}{d.person ? ` · ${d.person}` : ""}{d.recurrence !== "none" ? ` · ${RECURRENCES[d.recurrence]}` : ""}</p>
        <p className="text-[length:var(--text-micro)] text-muted">Reminders: {d.reminderDays.length ? [...d.reminderDays].sort((a, b) => b - a).map((n) => (n === 0 ? "on the day" : `${n}d`)).join(", ") : "none"}{d.reminderOn ? `, and ${fmtDate(d.reminderOn)}` : ""}{d.notes ? ` · ${d.notes}` : ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {d.documentId && <a className="btn btn-ghost" href={`/api/documents/${d.documentId}/file`} target="_blank" rel="noreferrer" aria-label={`Open the document for ${d.title}`}>Document</a>}
        {d.status === "upcoming" && <Link className="btn btn-ghost" href={`${base}/requests/new?text=${encodeURIComponent(`Please help me with this: ${d.title}, due on ${d.dueOn}.`)}`}>Ask for help</Link>}
        {canManage && <BillActions id={d.id} title={d.title} status={d.status} />}
      </div>
    </li>
  );
}

export default async function Bills({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const { view = "upcoming" } = await searchParams;
  const access = await familyAccess(id);
  if (!access.canSeeBills) notFound();
  const [deadlines, calendar, properties, docs] = await Promise.all([deadlinesFor(id), calendarFor(id, access), access.canReadRequests ? propertiesFor(id) : [], documentsFor(id)]);
  const today = istDate(new Date());
  const base = `/family/${id}`;
  const open = deadlines.filter((d) => d.status === "upcoming");
  const shown = view === "list" ? deadlines : open.filter((d) => daysBetween(today, d.dueOn) <= 60);
  const tab = (key: string, label: string) => ({ href: `${base}/bills?view=${key}`, label, active: view === key });
  return (
    <section className="grid gap-5">
      <PageHeader title="Bills & Renewals" sub="Every date that matters back home, in one place. Nothing here is paid or scheduled automatically." />
      <Tabs items={[tab("upcoming", "Upcoming"), tab("list", "All items"), tab("calendar", "Calendar")]} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        {view === "calendar" ? (
          <Panel><MiniCalendar items={calendar} today={today} listLimit={12} /></Panel>
        ) : shown.length === 0 ? (
          <Empty title={deadlines.length === 0 ? "No bills or renewals yet." : "Nothing due in the next 60 days."}>Add electricity, water, society dues, property tax, rent agreements and insurance renewals, and they will appear on your Overview as they come close.</Empty>
        ) : (
          <Panel><ul className="rows">{shown.map((d) => <BillRow key={d.id} d={d} today={today} canManage={access.canManageBills} base={base} />)}</ul></Panel>
        )}
        {access.canManageBills && <AddBillForm familyId={id} properties={properties.map((p) => ({ id: p.id, name: p.name }))} documents={docs.map((d) => ({ id: d.id, title: d.title }))} />}
      </div>
      <p className="text-[length:var(--text-small)] text-muted">Marking something handled records that it has been dealt with. It does not mean Ally paid it. Reminders appear on your Overview. Email and WhatsApp reminders are not switched on yet.</p>
    </section>
  );
}
