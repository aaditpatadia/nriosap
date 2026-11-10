export const dynamic = "force-dynamic";

import { requireStaff } from "@/lib/auth";
import { hoursReport } from "@/lib/ops";
import { fmtShort, usd } from "@/lib/format";
import { whatsappMetrics } from "@/lib/wa-inbox";

export default async function Reports() {
  await requireStaff();
  const [rows, wa] = await Promise.all([hoursReport(), whatsappMetrics(30)]);
  const totalRev = rows.reduce((s, r) => s + r.planUsd, 0);
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const weeks = rows[0]?.weeks ?? [];
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[length:var(--text-h1)] font-bold">Reports: hours per family</h1>
        <a className="btn btn-secondary" href="/ops/families/export" download>Download CSV</a>
      </div>
      <p className="max-w-3xl text-muted">The number that decides whether this business works. Hours are for this calendar month in India. Margin uses the research model: $2.92 loaded labour per hour plus 15% overhead, $6.74 fixed cost per family, and 4.5% of price for payment fees and bad debt. Kill line from the research: more than 6 hours at $79, or 3.4 at $40.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-muted">Monthly revenue</p><p className="text-3xl font-bold">{usd(totalRev)}</p></div>
        <div className="card"><p className="text-muted">Desk hours this month</p><p className="text-3xl font-bold">{totalHours.toFixed(1)}</p></div>
        <div className="card"><p className="text-muted">Average hours per family</p><p className="text-3xl font-bold">{rows.length ? (totalHours / rows.length).toFixed(1) : "0.0"}</p></div>
      </div>
      <div role="region" aria-label="Hours table" tabIndex={0} className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-[length:var(--text-small)]">
          <caption className="sr-only">Hours, budget and margin per family this month</caption>
          <thead className="text-muted"><tr><th className="p-3">Family</th><th className="p-3">Plan</th><th className="p-3">Hours</th><th className="p-3">Budget</th><th className="p-3">Gross margin</th><th className="p-3">Break-even hours</th><th className="p-3">Flags</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line" data-family={r.name}>
                <td className="p-3 font-semibold">{r.name}</td>
                <td className="p-3">${r.planUsd}</td>
                <td className="p-3" data-testid="hours">{r.hours.toFixed(1)}</td>
                <td className="p-3">{r.budget}</td>
                <td className="p-3" data-testid="margin">{r.margin}%</td>
                <td className="p-3">{r.breakEven}</td>
                <td className="p-3"><div className="flex flex-wrap gap-1">
                  {r.over ? <span className="chip" data-tone="danger">Over hour budget</span> : <span className="chip" data-tone="ok">Within budget</span>}
                  {r.late > 0 && <span className="chip" data-tone="warn">{r.late} past SLA</span>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="text-[length:var(--text-h2)] font-bold">Trend by week</h2>
      <div role="region" aria-label="Weekly hours table" tabIndex={0} className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-[length:var(--text-small)] tabular-nums">
          <caption className="sr-only">Desk hours per family for each of the last eight weeks</caption>
          <thead className="text-muted"><tr><th className="p-3">Family</th>{weeks.map((w) => <th key={w.weekStart} className="p-3">{fmtShort(w.weekStart)}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="p-3 font-semibold">{r.name}</td>
                {r.weeks.map((w) => <td key={w.weekStart} className="p-3">{w.hours.toFixed(1)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="text-[length:var(--text-h2)] font-bold">WhatsApp, last 30 days</h2>
      <p className="max-w-3xl text-muted">Correct means a person confirmed the AI category without changing it. Only messages the AI read are counted there. Time to first human touch runs from arrival to the first desk action on the message.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="wa-metrics">
        <div className="card"><p className="text-muted">Messages received</p><p className="text-3xl font-bold">{wa.received}</p></div>
        <div className="card"><p className="text-muted">Auto-categorised correctly</p><p className="text-3xl font-bold">{wa.confirmedUnchanged}</p><p className="text-[length:var(--text-small)] text-muted">of {wa.aiRead} read by AI</p></div>
        <div className="card"><p className="text-muted">Corrected by a person</p><p className="text-3xl font-bold">{wa.corrected}</p></div>
        <div className="card"><p className="text-muted">Median time to first human touch</p><p className="text-3xl font-bold">{wa.medianMinutesToHuman === null ? "None yet" : `${wa.medianMinutesToHuman} min`}</p></div>
      </div>
    </section>
  );
}
