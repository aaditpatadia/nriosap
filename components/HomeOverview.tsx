import Link from "next/link";
import { Glyph, type NavIcon } from "./FamilyNav";
import { MiniCalendar, type CalItem } from "./MiniCalendar";
import { fmtDate, inr } from "@/lib/format";
import { STATUS_META } from "@/lib/request-engine";
import type { ServiceRequest, Quotation } from "@/lib/service-requests";
import { daysBetween } from "@/lib/workspace-rules";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const when = (today: string, date: string) => {
  const d = daysBetween(today, date);
  return d === 0 ? "Today" : d === 1 ? "Tomorrow" : d < 0 ? `${-d} day${d === -1 ? "" : "s"} late` : `In ${d} days`;
};

const QUICK: [string, string][] = [
  ["A property check or repair", "Please arrange someone to check my flat in "],
  ["Papers and certificates", "I need help getting a copy of "],
  ["Something for my family", "Please help my parents with "],
  ["Something else", ""],
];

/** The dark band at the top of Home: today in India, what is next, a quick start and the month. */
export function OverviewBand({ base, today, attention, calendar, canCreate, coordinator }: { base: string; today: string; attention: number; calendar: CalItem[]; canCreate: boolean; coordinator: { name: string; city: string | null } | null }) {
  const d = new Date(`${today}T00:00:00Z`);
  const next = calendar.filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const soon = calendar.filter((c) => c.date >= today && daysBetween(today, c.date) <= 30).length;
  return (
    <div className="band-wrap"><section className="band-dark" aria-label="Today and what is next">
      <div className="band-tile" data-plain="true">
        <div>
          <p className="band-day">{WEEKDAY[d.getUTCDay()]}</p>
          <p className="band-date" aria-label={`${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`}>{d.getUTCDate()}</p>
          <p className="band-muted mt-1 text-[length:var(--text-small)]">{MONTH[d.getUTCMonth()]} in India</p>
        </div>
        {attention > 0
          ? <a className="band-note" href="#attention">{attention} thing{attention === 1 ? "" : "s"} need{attention === 1 ? "s" : ""} you. See below.</a>
          : <p className="band-note" data-tone="ok">All clear for now.</p>}
      </div>

      <div className="grid content-start gap-3">
        <Link className="band-pill" href={`${base}/bills`}>
          <span>Coming up{soon ? ` (${soon})` : ""}</span>
          <span aria-hidden className="band-pill-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg></span>
        </Link>
        <div className="band-tile">
          {next ? (
            <>
              <span aria-hidden className="grid size-11 place-items-center rounded-full bg-[var(--b-green)] text-[var(--b-on-green)]"><Glyph name="calendar" /></span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Link href={next.href} className="band-title">{next.label}</Link>
                <span className="band-chip">{when(today, next.date)}</span>
              </div>
              <p className="band-muted text-[length:var(--text-micro)]">{next.kind} · {fmtDate(next.date)}</p>
            </>
          ) : (
            <>
              <p className="band-title">Nothing due</p>
              <p className="band-muted text-[length:var(--text-small)]">Add bills, renewals and important dates, and they show here before they are due.</p>
            </>
          )}
        </div>
      </div>

      <div className="band-tile">
        {canCreate ? (
          <>
            <p className="band-muted text-[length:var(--text-small)]">What do you need handled in India?</p>
            <ul className="grid">
              {QUICK.map(([label, text]) => <li key={label}><Link className="band-option" href={`${base}/requests/new${text ? `?text=${encodeURIComponent(text)}` : ""}`}>{label}</Link></li>)}
            </ul>
            <Link className="band-btn w-fit" href={`${base}/requests/new`}><span aria-hidden>+</span> New request</Link>
          </>
        ) : (
          <>
            <p className="band-muted text-[length:var(--text-small)]">Your coordinator</p>
            <p className="band-title">{coordinator?.name ?? "Being assigned"}</p>
            <p className="band-muted text-[length:var(--text-small)]">{coordinator?.city ? `Based in ${coordinator.city}` : "Based in India"}</p>
          </>
        )}
      </div>

      <div className="band-tile band-cal">
        <MiniCalendar items={calendar} today={today} listLimit={0} fill />
      </div>
    </section></div>
  );
}

export interface StatCard { label: string; value: number; href: string; icon: NavIcon; sub: string; tone?: "danger" | "ok"; go?: string }

/** Four big numbers. The first is highlighted and says where it leads. */
export function StatCards({ cards }: { cards: StatCard[] }) {
  return (
    <section className="stats" aria-label="Your summary">
      {cards.map((c, i) => (
        <Link key={c.label} href={c.href} className="stat" data-hl={i === 0}>
          <span className="stat-head"><span aria-hidden className="stat-icon"><Glyph name={c.icon} /></span><span className="stat-label">{c.label}</span></span>
          <span className="stat-sub" data-tone={c.tone}>{c.sub}</span>
          <span className="stat-foot"><span className="stat-value">{c.value}</span>{c.go && <span className="stat-go">{c.go}</span>}</span>
        </Link>
      ))}
    </section>
  );
}

const CATEGORY: Record<string, [NavIcon, string]> = {
  "Property and Assets": ["building", "#2f6aa8"],
  "Documents and Government Paperwork": ["doc", "#6d48b5"],
  "Family and Personal Assistance": ["people", "#b23b6f"],
  "Bills and Renewals": ["calendar", "#a85a14"],
  "Repairs and Local Services": ["tool", "#1f7a4c"],
  "Insurance Administration": ["check", "#0e6d86"],
  "Business and Administrative Coordination": ["chart", "#475569"],
  "Custom Requests": ["spark", "#8f3a12"],
};

/** Requests as a table on a computer, and as small cards on a phone. */
export function RequestTable({ base, requests, quotes }: { base: string; requests: ServiceRequest[]; quotes: Quotation[] }) {
  const cost = new Map<string, number>();
  for (const q of quotes) if (q.status !== "rejected" && q.status !== "superseded" && !cost.has(q.requestId)) cost.set(q.requestId, q.totalInr);
  return (
    <table className="dtable">
      <thead><tr><th scope="col">Request</th><th scope="col">Last update</th><th scope="col">Cost</th><th scope="col">Where</th><th scope="col">Status</th></tr></thead>
      <tbody>
        {requests.map((r) => {
          const [icon, color] = CATEGORY[r.category] ?? CATEGORY["Custom Requests"];
          const meta = STATUS_META[r.status];
          const price = cost.get(r.id);
          return (
            <tr key={r.id} className="dt-row">
              <td>
                <span className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className="dt-avatar" style={{ background: color }}><Glyph name={icon} /></span>
                  <span className="min-w-0">
                    <Link className="dt-link" href={`${base}/requests/${r.id}`}>{r.title}</Link>
                    <span className="block text-[length:var(--text-micro)] text-muted">{r.ref}</span>
                    <span className="dt-meta text-[length:var(--text-micro)] text-muted">Updated {fmtDate(r.updatedAt)}{price !== undefined ? ` · ${inr(price)}` : ""}{r.location ? ` · ${r.location}` : ""}</span>
                  </span>
                </span>
              </td>
              <td className="dt-wide whitespace-nowrap text-muted">{fmtDate(r.updatedAt)}</td>
              <td className="dt-wide">{price !== undefined ? <span className="dt-amount">{inr(price)}</span> : <span className="text-muted">Not quoted</span>}</td>
              <td className="dt-wide text-muted">{r.location ?? "Not set"}</td>
              <td><span className="chip whitespace-nowrap" data-tone={meta.tone}>{meta.label}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
