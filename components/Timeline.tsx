"use client";

import { staggerDelay } from "@/lib/motion";
import { fromNow } from "@/lib/format";
import type { TimelineEvent } from "@/lib/types";

const LABEL: Record<TimelineEvent["kind"], string> = { message: "Message", document: "Document", claim: "Claim", bill: "Bill", visit: "Visit", approval: "Approval", system: "Desk" };

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <p className="text-[length:var(--text-small)] text-muted">Nothing yet. The first update will show here.</p>;
  return (
    <ol className="timeline grid gap-4" aria-label="Timeline of what is happening">
      {events.map((e, i) => (
        // CSS rather than script, so the first line paints without waiting for JavaScript.
        <li key={e.id} className="rise" style={{ animationDelay: `${staggerDelay(i)}s` }}>
          <p className="text-[length:var(--text-small)] [overflow-wrap:anywhere]">{e.text}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-[length:var(--text-micro)] text-muted">
            <span>{LABEL[e.kind]}</span><span aria-hidden>·</span><span>{e.actorName}</span><span aria-hidden>·</span>
            <time dateTime={e.at} suppressHydrationWarning>{fromNow(e.at)}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}
