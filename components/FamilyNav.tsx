"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { m } from "motion/react";
import { spring } from "@/lib/motion";
import { useStoredFlag } from "@/lib/stored-flag";

type Glyph = React.ReactNode;
const ITEMS: { href: string; label: string; icon: Glyph }[] = [
  { href: "", label: "Overview", icon: <><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></> },
  { href: "/requests", label: "My Requests", icon: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></> },
  { href: "/documents", label: "Document Vault", icon: <><path d="M4 20V6a2 2 0 0 1 2-2h4l2 3h6a2 2 0 0 1 2 2v11z" /></> },
  { href: "/properties", label: "Properties & Assets", icon: <><path d="M4 21V8l8-5 8 5v13" /><path d="M9 21v-7h6v7" /></> },
  { href: "/calendar", label: "Bills & Renewals", icon: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></> },
  { href: "/people", label: "Family", icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 5a3.5 3.5 0 0 1 0 7M18 15a7 7 0 0 1 4 6" /></> },
  { href: "/approvals", label: "Payments & Approvals", icon: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 11h18" /></> },
  { href: "/ask", label: "Ally AI", icon: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" /></> },
  { href: "/activity", label: "Activity & Reports", icon: <><path d="M3 12h4l3 8 4-16 3 8h4" /></> },
  { href: "/settings", label: "Settings", icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></> },
];

/** The signed-in app: a sidebar that folds away on a computer and a scrolling strip on a phone. */
export function AppShell({ base, pendingCount, hidden, canCreate, children }: { base: string; pendingCount: number; hidden: string[]; canCreate: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useStoredFlag("sidebar-collapsed");
  return (
    <div className="app-grid" data-collapsed={collapsed}>
      <aside className="app-side no-print">
        {canCreate && (
          <Link href={`${base}/requests/new`} className="btn btn-primary app-cta" aria-label="Get Anything Done">
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            <span className="app-label">Get Anything Done</span>
          </Link>
        )}
        <nav aria-label="Family sections">
          <ul className="app-nav">
            {ITEMS.filter((it) => !hidden.includes(it.href)).map((it) => {
              const href = base + it.href;
              const active = it.href === "" ? path === base : path.startsWith(href);
              return (
                <li key={it.href} className="relative">
                  {active && <m.span layoutId="family-tab" transition={spring.snappy} className="absolute inset-0 rounded-xl bg-tint" />}
                  <Link href={href} aria-current={active ? "page" : undefined} title={collapsed ? it.label : undefined} className={`app-link relative ${active ? "text-ink" : "text-muted"}`}>
                    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">{it.icon}</svg>
                    <span className="app-label">{it.label}</span>
                    {it.href === "/approvals" && pendingCount > 0 && <span className="chip app-badge" data-tone="warn">{pendingCount}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <button type="button" className="btn btn-ghost app-fold" aria-pressed={collapsed} onClick={() => setCollapsed(!collapsed)}>
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
          <span className="app-label">Fold the menu</span>
        </button>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
