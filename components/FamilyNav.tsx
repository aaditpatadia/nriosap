"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { m } from "motion/react";
import { spring } from "@/lib/motion";
import { SIDEBAR_COOKIE, writeSidebarCookie } from "@/lib/sidebar-pref";
import { Logo, LogoMark } from "./Logo";

export type NavIcon = keyof typeof GLYPHS;
const GLYPHS = {
  home: <><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></>,
  list: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  folder: <path d="M4 20V6a2 2 0 0 1 2-2h4l2 3h6a2 2 0 0 1 2 2v11z" />,
  building: <><path d="M4 21V8l8-5 8 5v13" /><path d="M9 21v-7h6v7" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 5a3.5 3.5 0 0 1 0 7M18 15a7 7 0 0 1 4 6" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>,
  spark: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  queue: <><rect x="3" y="4" width="18" height="5" rx="1" /><rect x="3" y="12" width="18" height="8" rx="1" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 18v3h3l6.4-6.3a4 4 0 0 0 5.3-5.4l-2.6 2.6-2.8-.7-.7-2.8z" />,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 13h6M9 17h6" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
} as const;

export function Glyph({ name }: { name: NavIcon }) {
  return <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="relative shrink-0">{GLYPHS[name]}</svg>;
}

export interface ShellItem { href: string; label: string; icon: NavIcon; badge?: number; primary?: boolean; short?: string; also?: string[] }

/** Sidebar on a computer. On a phone: a drawer, plus a bar of the most used sections at the thumb. */
export function Shell({ home, navLabel, items, cta, foot, children, defaultCollapsed = false }: { defaultCollapsed?: boolean; home: string; navLabel: string; items: ShellItem[]; cta?: { href: string; label: string }; foot: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsedState] = useState(defaultCollapsed);
  const [ready, setReady] = useState(false);
  const setCollapsed = (v: boolean) => { setCollapsedState(v); writeSidebarCookie(v); };
  useEffect(() => {
    // After the first paint: carry over an old browser-only setting once, and allow the closing delay on hover.
    const id = requestAnimationFrame(() => {
      try {
        if (!document.cookie.includes(`${SIDEBAR_COOKIE}=`) && localStorage.getItem("sidebar-collapsed") === "1") { setCollapsedState(true); writeSidebarCookie(true); }
      } catch { /* storage can be blocked */ }
      setReady(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  // Remembers which page the drawer was opened on, so moving to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (v: boolean) => setOpenOn(v ? path : null);
  const isActive = (href: string, also: string[] = []) => (href === home ? path === home : [href, ...also].some((h) => path.startsWith(h)));
  return (
    <div className="shell" data-collapsed={collapsed} data-ready={ready} data-open={open}>
      <header className="mobile-top no-print">
        <Link href={home} className="inline-flex min-h-12 items-center" aria-label="Ally overview"><Logo /></Link>
        {cta && <Link href={cta.href} className="btn btn-secondary">{cta.label}</Link>}
      </header>
      <span className="side-scrim no-print" aria-hidden onClick={() => setOpen(false)} />
      <aside className="side no-print">
        <span aria-hidden className="side-glow" />
        <span aria-hidden className="side-bg" />
        <span aria-hidden className="side-edge" />
        <div className="side-scroll">
        <div className="side-head">
          <Link href={home} className="flex min-h-12 items-center gap-2 px-1 text-lg font-bold" aria-label="Ally overview">
            <LogoMark size={30} /><span className="side-text">Ally</span>
          </Link>
          <button type="button" className="side-fold" aria-label={collapsed ? "Keep the menu open" : "Fold the menu"} title={collapsed ? "Keep the menu open" : "Fold the menu"} aria-pressed={collapsed} onClick={() => setCollapsed(!collapsed)}>
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />{collapsed ? <path d="M13.5 9.5l2.5 2.5-2.5 2.5" /> : <path d="M16 9.5L13.5 12l2.5 2.5" />}</svg>
          </button>
        </div>
        {cta && (
          <Link href={cta.href} className="btn btn-primary w-full px-3">
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            <span className="side-text">{cta.label}</span>
          </Link>
        )}
        <nav aria-label={navLabel}>
          <ul className="side-nav">
            {items.map((it) => {
              const active = isActive(it.href, it.also);
              return (
                <li key={it.href}>
                  <Link href={it.href} aria-current={active ? "page" : undefined} title={collapsed ? it.label : undefined} className="side-link">
                    {active && <m.span layoutId={`${navLabel}-mark`} transition={spring.snappy} className="side-mark" />}
                    <Glyph name={it.icon} />
                    <span className="side-text relative">{it.label}</span>
                    {!!it.badge && <span className="chip side-badge" data-tone="warn">{it.badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="side-foot">
          <div className="side-foot-detail grid gap-1">{foot}</div>
        </div>
        </div>
      </aside>
      <div className="content">{children}</div>
      <nav className="bottom-nav no-print" aria-label="Main sections">
        {items.filter((i) => i.primary).map((it) => (
          <Link key={it.href} href={it.href} aria-current={isActive(it.href, it.also) ? "page" : undefined} className="bottom-link"><Glyph name={it.icon} />{it.short ?? it.label}</Link>
        ))}
        <button type="button" className="bottom-link" aria-expanded={open} onClick={() => setOpen(!open)}><Glyph name="menu" />Menu</button>
      </nav>
    </div>
  );
}
