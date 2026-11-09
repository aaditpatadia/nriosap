import { notFound } from "next/navigation";
import { claimsFor, documentsFor, getFamily, tasksFor, policyFor } from "@/lib/store";
import { fmtDate, fromNow } from "@/lib/format";

const monthOf = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export default async function CalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getFamily(id))) notFound();
  const [policy, tasks, claims, docs] = await Promise.all([policyFor(id), tasksFor(id), claimsFor(id), documentsFor(id)]);
  const items: { at: string; label: string; kind: string }[] = [];
  if (policy?.renewalDate) items.push({ at: policy.renewalDate, label: `Health policy renews (${policy.insurer})`, kind: "Renewal" });
  for (const t of tasks) if (t.status !== "done" && t.dueAt) items.push({ at: t.dueAt, label: t.title, kind: t.kind === "bill" ? "Bill" : t.kind === "renewal" ? "Renewal" : "Task" });
  for (const c of claims) if (c.status !== "settled" && c.slaDueAt) items.push({ at: c.slaDueAt, label: `Claim check: ${c.hospital}`, kind: "Claim" });
  for (const d of docs) {
    const due = d.extracted["Due date"];
    if (d.kind === "bill" && due && /^\d{4}-\d{2}-\d{2}$/.test(due)) items.push({ at: `${due}T12:00:00+05:30`, label: `Bill due: ${d.extracted["Bill payee"] ?? d.title}`, kind: "Bill" });
  }
  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const months = [...new Set(items.map((i) => monthOf(i.at)))];
  return (
    <section className="grid gap-4">
      <h1 className="text-[length:var(--text-h1)] font-bold">Calendar</h1>
      {items.length === 0 && <p className="text-muted">Nothing on the calendar yet.</p>}
      {months.map((m) => (
        <div key={m} className="grid gap-3">
          <h2 className="text-[length:var(--text-h2)] font-bold">{m}</h2>
          <ul className="grid gap-3">
            {items.filter((i) => monthOf(i.at) === m).map((i, n) => (
              <li key={n} className="card flex flex-wrap items-center justify-between gap-2">
                <span><span className="chip mr-2">{i.kind}</span>{i.label}</span>
                <span className="text-muted">{fmtDate(i.at)} · {fromNow(i.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
