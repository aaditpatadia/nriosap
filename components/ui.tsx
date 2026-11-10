import Link from "next/link";
import { CountUp } from "./CountUp";

/** The shared building blocks of the signed-in product. Pages compose these instead of styling from scratch. */
export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="page-head flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[length:var(--text-h1)] font-bold [overflow-wrap:anywhere]">{title}</h1>
        {sub && <p className="mt-1 max-w-3xl text-[length:var(--text-small)] text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Metric({ label, value, href, alert }: { label: string; value: number; href?: string; alert?: boolean }) {
  const body = (
    <>
      <CountUp value={value} className={`metric-value ${alert && value > 0 ? "text-warn" : ""}`} />
      <span className="metric-label">{label}</span>
    </>
  );
  return href ? <Link href={href} className="metric-cell">{body}</Link> : <div className="metric-cell">{body}</div>;
}

export function Panel({ title, action, children, className = "", id }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`card grid content-start gap-3 ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="section-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <p className="font-semibold">{title}</p>
      {children && <p className="max-w-xl text-[length:var(--text-small)] text-muted">{children}</p>}
      {action}
    </div>
  );
}

export function Tabs({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav className="tab-row no-print" aria-label="Views">
      {items.map((t) => <Link key={t.href} href={t.href} className="tab" aria-current={t.active ? "page" : undefined}>{t.label}</Link>)}
    </nav>
  );
}

export function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-2 text-[length:var(--text-small)]">
      {items.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
        <div key={k} className="flex flex-wrap justify-between gap-x-4"><dt className="text-muted">{k}</dt><dd className="text-right font-medium [overflow-wrap:anywhere]">{v}</dd></div>
      ))}
    </dl>
  );
}
