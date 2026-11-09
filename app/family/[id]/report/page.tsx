import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { claimsFor, documentsFor, getFamily, tasksFor, timeFor, timeline } from "@/lib/store";
import { fmtDate, fmtShort, inr } from "@/lib/format";
import { entriesThisMonth, hoursFor, monthStartIst } from "@/lib/rules";

const STATUS_WORDS = { preparing: "being prepared", submitted: "submitted", query: "the insurer has a question", approved: "approved", settled: "settled" } as const;

export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const now = new Date();
  const start = monthStartIst(now);
  const [all, tasks, claims, time, docs] = await Promise.all([timeline(id), tasksFor(id), claimsFor(id), timeFor(id), documentsFor(id)]);
  const events = all.filter((e) => new Date(e.at) >= start);
  const done = tasks.filter((t) => t.status === "done");
  const open = tasks.filter((t) => t.status !== "done").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const hours = hoursFor(entriesThisMonth(time, now));
  const newDocs = docs.filter((d) => new Date(d.uploadedAt) >= start);
  const month = now.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  return (
    <section className="report grid gap-4 lg:grid-cols-3 lg:items-start [&>div:first-child]:lg:col-span-3 [&>p]:lg:col-span-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[length:var(--text-h1)] font-bold">{month} report for {fam.parent.name}</h1>
        <PrintButton />
      </div>
      <p className="text-muted">Written in plain words so you can read it in two minutes. Prepared {fmtDate(now.toISOString())}.</p>
      <div className="card grid gap-2">
        <h2 className="text-[length:var(--text-h3)] font-semibold">What happened</h2>
        <p>{events.length} update{events.length === 1 ? "" : "s"}, {done.length} task{done.length === 1 ? "" : "s"} finished, {open.length} still open, {newDocs.length} new document{newDocs.length === 1 ? "" : "s"}.</p>
        <p>Desk time spent on your family this month: about {hours.toFixed(1)} hours.</p>
        <ul className="list-disc pl-6">{events.slice(0, 8).map((e) => <li key={e.id}>{fmtShort(e.at)}: {e.text}</li>)}</ul>
      </div>
      <div className="card grid gap-2">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Claims</h2>
        {claims.length === 0 && <p className="text-muted">No claims.</p>}
        {claims.map((c) => (<p key={c.id}>{c.hospital}: {STATUS_WORDS[c.status]}{c.amountSettledInr ? `, settled ${inr(c.amountSettledInr)}` : ""}. Next check {fmtShort(c.slaDueAt)}.{c.missing.length ? ` Still missing: ${c.missing.join(", ")}.` : ""}</p>))}
      </div>
      <div className="card grid gap-2">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Coming up</h2>
        {open.length === 0 && <p className="text-muted">Nothing open.</p>}
        <ul className="list-disc pl-6">{open.slice(0, 5).map((t) => (<li key={t.id}>{t.title} (due {fmtShort(t.dueAt)})</li>))}</ul>
      </div>
      <p className="text-[length:var(--text-small)] text-muted">This report covers administration only. For medical, legal or tax questions, please speak to the relevant professional.</p>
    </section>
  );
}
