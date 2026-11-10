import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { Metric, PageHeader, Panel, Tabs } from "@/components/ui";
import { fmtDate, fmtShort, inr } from "@/lib/format";
import { SERVICE_CATEGORIES, STATUS_META, type RequestStatus } from "@/lib/request-engine";
import { familyAccess, propertiesFor } from "@/lib/service-requests";
import { claimsFor, getFamily } from "@/lib/store";
import { reportFor } from "@/lib/workspace";
import { isMonthKey, istDate, monthLabel } from "@/lib/workspace-rules";

export const metadata = { title: "Monthly report" };
const STATUS_WORDS = { preparing: "being prepared", submitted: "submitted", query: "the insurer has a question", approved: "approved", settled: "settled" } as const;

const List = ({ items, none }: { items: string[]; none: string }) => items.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">{none}</p> : <ul className="grid list-disc gap-1 pl-5 text-[length:var(--text-small)]">{items.map((t, i) => <li key={i} className="[overflow-wrap:anywhere]">{t}</li>)}</ul>;

export default async function Report({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string; category?: string; property?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const fam = await getFamily(id);
  const access = await familyAccess(id);
  if (!fam || (!access.owner && !access.staff)) notFound();
  const now = new Date();
  const month = isMonthKey(sp.month) ? sp.month : istDate(now).slice(0, 7);
  const category = sp.category && (SERVICE_CATEGORIES as readonly string[]).includes(sp.category) ? sp.category : undefined;
  const [claims, properties, r] = await Promise.all([claimsFor(id), propertiesFor(id), reportFor(id, month, category, sp.property)]);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15)); return d.toISOString().slice(0, 7); });
  const base = `/family/${id}`;
  const query = new URLSearchParams({ month, ...(category ? { category } : {}), ...(sp.property ? { property: sp.property } : {}) }).toString();
  return (
    <section className="report grid gap-5">
      <PageHeader title={`${monthLabel(month)} report${fam.parent.isSelf ? "" : ` for ${fam.parent.name}`}`} sub={`Prepared ${fmtDate(now.toISOString())}, from what is recorded in Ally.`}>
        <a className="btn btn-secondary no-print" href={`${base}/report/pdf?${query}`}>Download PDF</a>
        <PrintButton />
      </PageHeader>
      <Tabs items={[{ href: `${base}/activity`, label: "Activity", active: false }, { href: `${base}/report`, label: "Monthly report", active: true }, { href: `${base}/privacy`, label: "Access log", active: false }]} />
      <form className="no-print flex flex-wrap items-end gap-2" aria-label="Filter the report">
        <label className="field">Month<select className="input" name="month" defaultValue={month}>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
        <label className="field">Category<select className="input" name="category" defaultValue={category ?? ""}><option value="">All</option>{SERVICE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        {properties.length > 0 && <label className="field">Property<select className="input" name="property" defaultValue={sp.property ?? ""}><option value="">All</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <button className="btn btn-secondary">Apply</button>
      </form>
      <div className="metric-strip">
        <Metric label="Requests completed" value={r.completed.length} /><Metric label="In progress" value={r.inProgress.length} /><Metric label="Visits" value={r.visits.length} /><Metric label="Documents added" value={r.documents.length} /><Metric label="Bills and renewals handled" value={r.handledDeadlines.length} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Completed"><List items={r.completed.map((x) => `${x.ref}: ${x.title}`)} none="Nothing completed in this month." /></Panel>
        <Panel title="In progress"><List items={r.inProgress.map((x) => `${x.ref}: ${x.title} (${STATUS_META[x.status as RequestStatus].label})`)} none="Nothing in progress." /></Panel>
        <Panel title="Visits"><List items={r.visits.map((v) => `${fmtShort(v.at)}: ${v.purpose}${v.status === "completed" ? "" : " (scheduled)"}`)} none="No visits in this month." /></Panel>
        <Panel title="Documents collected"><List items={r.documents} none="No new documents." /></Panel>
        <Panel title="Bills and renewals handled"><List items={r.handledDeadlines} none="None marked handled." /></Panel>
        <Panel title="Approved costs"><List items={r.approved.map((a) => `${a.title}: ${inr(a.totalInr)}. Approved. Payment not confirmed by any payment system.`)} none="No costs approved in this month." /></Panel>
        <Panel title="Coming up"><List items={r.upcoming.map((d) => `${d.title}, due ${fmtDate(d.dueOn)}`)} none="Nothing upcoming." /></Panel>
        <Panel title="Waiting on you"><List items={r.pending} none="Nothing is waiting on you." /></Panel>
        {claims.length > 0 && <Panel title="Claims"><List items={claims.map((c) => `${c.hospital}: ${STATUS_WORDS[c.status]}${c.amountSettledInr ? `, settled ${inr(c.amountSettledInr)}` : ""}.${c.missing.length ? ` Still missing: ${c.missing.join(", ")}.` : ""}`)} none="" /></Panel>}
        <Panel title="Coordinator updates"><List items={r.updates.map((u) => `${fmtShort(u.at)}: ${u.text}`)} none="No updates in this month." /></Panel>
      </div>
      <p className="text-[length:var(--text-small)] text-muted">This report covers administration only. For medical, legal or tax questions, please speak to the relevant professional.</p>
    </section>
  );
}
