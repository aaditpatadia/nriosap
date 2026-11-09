"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { m } from "motion/react";
import { spring } from "@/lib/motion";

const ITEMS = [
  { href: "", label: "Overview" },
  { href: "/claims", label: "Claims" },
  { href: "/documents", label: "Documents" },
  { href: "/calendar", label: "Calendar" },
  { href: "/approvals", label: "Approvals" },
  { href: "/report", label: "Monthly report" },
  { href: "/billing", label: "Billing" },
];

export function FamilyNav({ base, pendingCount }: { base: string; pendingCount: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Family sections" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-1 border-b border-line">
        {ITEMS.map((it) => {
          const href = base + it.href;
          const active = it.href === "" ? path === base : path.startsWith(href);
          return (
            <li key={it.href} className="relative shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center gap-2 px-3 font-semibold ${active ? "text-ink" : "text-muted"}`}
              >
                {it.label}
                {it.href === "/approvals" && pendingCount > 0 && (
                  <span className="chip" data-tone="warn">{pendingCount}</span>
                )}
              </Link>
              {active && (
                <m.span layoutId="family-tab" transition={spring.snappy} className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-accent" />
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
