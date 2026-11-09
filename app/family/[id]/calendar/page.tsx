import { notFound } from "next/navigation";
import { claimsFor, getFamily, tasksFor, policyFor } from "@/lib/store";
import { fmtDate, fromNow } from "@/lib/format";

export default async function CalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getFamily(id)) notFound();
  const items: { at: string; label: string; kind: string }[] = [];
  const policy = policyFor(id, "demo-owner");
  if (policy) items.push({ at: policy.renewalDate, label: `Health policy renews (${policy.insurer})`, kind: "Renewal" });
  for (const t of tasksFor(id)) if (t.status !== "done") items.push({ at: t.dueAt, label: t.title, kind: t.kind === "bill" ? "Bill" : t.kind === "renewal" ? "Renewal" : "Task" });
  for (const c of claimsFor(id)) if (c.status !== "settled") items.push({ at: c.slaDueAt, label: `Claim check: ${c.hospital}`, kind: "Claim" });
  items.sort((a, b) => a.at.localeCompare(b.at));
  return (
    <section className="grid gap-4">
      <h1 className="text-[length:var(--text-h1)] font-bold">Calendar</h1>
      <ul className="grid gap-3">
        {items.map((i, n) => (
          <li key={n} className="card flex flex-wrap items-center justify-between gap-2">
            <span><span className="chip mr-2">{i.kind}</span>{i.label}</span>
            <span className="text-muted">{fmtDate(i.at)} · {fromNow(i.at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
