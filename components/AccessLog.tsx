"use client";

import { useMemo, useState } from "react";
import type { AuditGroup, LogRow } from "@/lib/audit-labels";

const FILTERS: [AuditGroup | "all", string][] = [["all", "Everything"], ["documents", "Documents"], ["requests", "Requests"], ["desk", "The desk"], ["account", "Account"]];
const PAGE = 8;

const dayLabel = (iso: string, today: string) => {
  const d = iso.slice(0, 10);
  if (d === today) return "Today";
  const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  if (d === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Who opened or changed what, grouped by day, with a filter and a short list that opens up when asked. */
export function AccessLog({ rows, today }: { rows: LogRow[]; today: string }) {
  const [filter, setFilter] = useState<AuditGroup | "all">("all");
  const [shown, setShown] = useState(PAGE);
  const list = useMemo(() => rows.filter((r) => filter === "all" || r.group === filter), [rows, filter]);
  const visible = list.slice(0, shown);
  const days = useMemo(() => {
    const out: { day: string; items: LogRow[] }[] = [];
    for (const r of visible) {
      const day = dayLabel(r.at, today);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(r); else out.push({ day, items: [r] });
    }
    return out;
  }, [visible, today]);

  return (
    <div className="grid gap-4">
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" className="chip min-h-11 cursor-pointer px-4" data-tone={filter === key ? "accent" : undefined} aria-pressed={filter === key} onClick={() => { setFilter(key); setShown(PAGE); }}>{label}</button>
        ))}
      </div>
      {list.length === 0 ? <p className="text-[length:var(--text-small)] text-muted">Nothing here yet.</p> : (
        <div className="grid gap-5">
          {days.map((d) => (
            <section key={d.day} aria-label={d.day} className="grid gap-1">
              <h3 className="text-[length:var(--text-micro)] font-semibold uppercase tracking-wide text-muted">{d.day}</h3>
              <ul className="rows">
                {d.items.map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{r.label}{r.count > 1 && <span className="ml-1 text-muted">x {r.count}</span>}<span className="block text-[length:var(--text-micro)] text-muted">{r.who}</span></span>
                    <span className="shrink-0 text-[length:var(--text-small)] tabular-nums text-muted">{timeOf(r.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {list.length > shown && <button type="button" className="btn btn-secondary w-fit" onClick={() => setShown((n) => n + 12)}>Show {Math.min(12, list.length - shown)} more</button>}
      {list.length > PAGE && shown >= list.length && <button type="button" className="btn btn-ghost w-fit px-0" onClick={() => setShown(PAGE)}>Show less</button>}
    </div>
  );
}
