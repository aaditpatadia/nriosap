"use client";

import { staggerDelay } from "@/lib/motion";
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
  if (events.length === 0) return <p className="text-muted">Nothing yet. The first update will show here.</p>;
  return (
    <ol className="timeline grid gap-3" aria-label="Timeline of what is happening">
      {events.map((e, i) => (
        // CSS rather than script, so the first card paints without waiting for JavaScript.
        <li key={e.id} className="card rise" style={{ animationDelay: `${staggerDelay(i)}s` }}>
          <div className="flex flex-wrap items-center gap-2 text-[length:var(--text-micro)] text-muted">
            <span className="chip" data-tone={e.actor === "ai" ? "accent" : undefined}>{ICON[e.kind]}</span>
            <span>{e.actorName}</span>
            <span aria-hidden>·</span>
            <time dateTime={e.at} suppressHydrationWarning>{fromNow(e.at)}</time>
          </div>
          <p className="mt-2">{e.text}</p>
        </li>
      ))}
    </ol>
  );
}
