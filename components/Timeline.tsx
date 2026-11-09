"use client";

import { m, useReducedMotion } from "motion/react";
import { dur, ease, staggerDelay } from "@/lib/motion";
import { fromNow } from "@/lib/format";
import type { TimelineEvent } from "@/lib/types";

const ICON: Record<TimelineEvent["kind"], string> = {
  message: "Message",
  document: "Document",
  claim: "Claim",
  bill: "Bill",
  visit: "Visit",
  approval: "Approval",
  system: "Desk",
};

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const reduce = useReducedMotion();
  if (events.length === 0) return <p className="text-muted">Nothing yet. The first update will show here.</p>;
  return (
    <ol className="grid gap-3" aria-label="Timeline of what is happening">
      {events.map((e, i) => (
        <m.li
          key={e.id}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? dur.fast : dur.base, ease: ease.out, delay: reduce ? 0 : staggerDelay(i) }}
          className="card"
        >
          <div className="flex flex-wrap items-center gap-2 text-[length:var(--text-micro)] text-muted">
            <span className="chip" data-tone={e.actor === "ai" ? "accent" : undefined}>{ICON[e.kind]}</span>
            <span>{e.actorName}</span>
            <span aria-hidden>·</span>
            <time dateTime={e.at} suppressHydrationWarning>{fromNow(e.at)}</time>
          </div>
          <p className="mt-2">{e.text}</p>
        </m.li>
      ))}
    </ol>
  );
}
