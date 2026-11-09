export const dynamic = "force-dynamic";

import { allTasks, familyHours, listFamilies } from "@/lib/store";
import { breakEvenHours, hourBudget, marginPct, overHourBudget, isPastSla } from "@/lib/rules";
import { usd } from "@/lib/format";

export default function Hours() {
  const now = new Date();
  const rows = listFamilies().map((f) => {
    const hours = familyHours(f.id);
    const late = allTasks().filter((t) => t.familyId === f.id && isPastSla(t, now)).length;
    return { f, hours, margin: marginPct(f.planUsd, hours), budget: hourBudget(f.planUsd), over: overHourBudget(f.planUsd, hours), breakEven: breakEvenHours(f.planUsd), late };
  });
  const totalRev = rows.reduce((s, r) => s + r.f.planUsd, 0);
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  return (
    <section className="grid gap-4">
      <h1 className="text-[length:var(--text-h1)] font-bold">Hours per family</h1>
      <p className="max-w-3xl text-muted">The number that decides whether this business works. Margin uses the research model: $2.92 loaded labour per hour plus 15% overhead, $6.74 fixed cost per family, and 4.5% of price for payment fees and bad debt. Kill line from the research: more than 6 hours at $79, or 3.4 at $40.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-muted">Monthly revenue</p><p className="text-3xl font-bold">{usd(totalRev)}</p></div>
        <div className="card"><p className="text-muted">Total desk hours</p><p className="text-3xl font-bold">{totalHours.toFixed(1)}</p></div>
        <div className="card"><p className="text-muted">Average hours per family</p><p className="text-3xl font-bold">{(totalHours / rows.length).toFixed(1)}</p></div>
      </div>
      <div role="region" aria-label="Scrollable table" tabIndex={0} className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-[length:var(--text-small)]">
          <caption className="sr-only">Hours, budget and margin per family</caption>
          <thead className="text-muted"><tr><th className="p-3">Family</th><th className="p-3">Plan</th><th className="p-3">Hours</th><th className="p-3">Budget</th><th className="p-3">Gross margin</th><th className="p-3">Break-even hours</th><th className="p-3">Flags</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.f.id} className="border-t border-line">
                <td className="p-3 font-semibold">{r.f.name}</td>
                <td className="p-3">${r.f.planUsd}</td>
                <td className="p-3">{r.hours.toFixed(1)}</td>
                <td className="p-3">{r.budget}</td>
                <td className="p-3">{r.margin}%</td>
                <td className="p-3">{r.breakEven}</td>
                <td className="p-3 flex flex-wrap gap-1">
                  {r.over ? <span className="chip" data-tone="danger">Over hour budget</span> : <span className="chip" data-tone="ok">Within budget</span>}
                  {r.late > 0 && <span className="chip" data-tone="warn">{r.late} past SLA</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
