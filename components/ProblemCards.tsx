"use client";

import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { dur, ease } from "@/lib/motion";

const PROBLEMS = [
  ["Your property needs an inspection.", "A coordinator arranges a visit and sends you dated photos and a written note."],
  ["Your parents need help with an appointment.", "Someone books it, goes along if they want, and keeps you posted."],
  ["Your insurance policy is expiring.", "We track the date, prepare the renewal, and wait for your yes."],
  ["You need a document collected.", "We find out what the office needs, collect it where allowed, and scan it to your vault."],
  ["Your electricity bill is overdue.", "Send a photo. We check it and arrange payment once you approve."],
  ["A vendor needs to visit your home.", "We let them in, stay with them, and tell you what was done."],
  ["You need something purchased and delivered.", "We buy it at the price you agreed, and send the bill and a delivery photo."],
  ["You need a local supplier verified.", "We visit, see what is there, and write down what we found."],
];

export function ProblemCards() {
  const [open, setOpen] = useState(0);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
      <ul className="grid gap-3 sm:grid-cols-2">
        {PROBLEMS.map(([p], i) => (
          <li key={p}>
            <button type="button" aria-pressed={open === i} onClick={() => setOpen(i)} onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(i); }} className={`card lift h-full min-h-12 w-full text-left font-semibold ${open === i ? "border-accent" : ""}`} style={open === i ? { borderColor: "var(--accent)" } : undefined}>{p}</button>
          </li>
        ))}
      </ul>
      <div className="band grid min-h-48 content-center gap-2 rounded-[var(--radius-card)] p-6 lg:sticky lg:top-28" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={open} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: dur.base, ease: ease.out }} className="grid gap-2">
            <p className="text-[length:var(--text-small)] text-muted">How Ally handles it</p>
            <p className="text-[length:var(--text-h2)] font-bold leading-snug">{PROBLEMS[open][1]}</p>
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
