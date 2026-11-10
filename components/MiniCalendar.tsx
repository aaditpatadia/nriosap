"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { m } from "motion/react";
import { spring } from "@/lib/motion";

export interface CalItem { date: string; label: string; kind: string; href: string }

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const pad = (n: number) => String(n).padStart(2, "0");

/** A month you can move through. Choosing a day lists what falls on it. */
export function MiniCalendar({ items, today, listLimit = 5 }: { items: CalItem[]; today: string; listLimit?: number }) {
  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const [picked, setPicked] = useState<string | null>(null);
  const byDay = useMemo(() => { const map = new Map<string, CalItem[]>(); for (const i of items) map.set(i.date, [...(map.get(i.date) ?? []), i]); return map; }, [items]);
  const first = new Date(Date.UTC(cursor.y, cursor.m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(cursor.y, cursor.m, 0)).getUTCDate();
  const label = first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const go = (d: number) => { const t = new Date(Date.UTC(cursor.y, cursor.m - 1 + d, 1)); setCursor({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 }); setPicked(null); };
  const shown = picked ? (byDay.get(picked) ?? []) : items.filter((i) => i.date >= today).slice(0, listLimit);
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Previous month" onClick={() => go(-1)}>‹</button>
        <p className="font-semibold" aria-live="polite">{label}</p>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Next month" onClick={() => go(1)}>›</button>
      </div>
      <div className="cal-grid text-center text-[length:var(--text-micro)] text-muted" aria-hidden>{DAYS.map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="cal-grid">
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const date = `${cursor.y}-${pad(cursor.m)}-${pad(i + 1)}`;
          const has = byDay.has(date);
          const on = picked === date;
          return (
            <button key={date} type="button" className="cal-day" data-today={date === today} aria-pressed={on} aria-label={`${i + 1} ${label}${has ? `, ${byDay.get(date)!.length} item${byDay.get(date)!.length === 1 ? "" : "s"}` : ""}`} onClick={() => setPicked(on ? null : date)}>
              {on && <m.span layoutId="cal-select" transition={spring.snappy} className="cal-select" />}
              <span className="relative">{i + 1}</span>
              {has && <span aria-hidden className="cal-dot" />}
            </button>
          );
        })}
      </div>
      <ul className="rows" aria-live="polite">
        {shown.length === 0 && <li className="py-2 text-[length:var(--text-small)] text-muted">{picked ? "Nothing on this day." : "Nothing coming up."}</li>}
        {shown.map((i, n) => (
          <li key={`${i.date}-${n}`}><Link href={i.href} className="row-link text-[length:var(--text-small)]"><span className="min-w-0 font-medium [overflow-wrap:anywhere]">{i.label}<span className="block text-[length:var(--text-micro)] font-normal text-muted">{i.kind}</span></span><span className="shrink-0 tabular-nums text-muted">{i.date.slice(8)}/{i.date.slice(5, 7)}</span></Link></li>
        ))}
      </ul>
    </div>
  );
}
