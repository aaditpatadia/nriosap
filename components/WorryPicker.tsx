"use client";

import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { IconCheck, IconMessage, IconPerson, IconSpark } from "./Icons";
import { dur, ease, spring, staggerDelay } from "@/lib/motion";

const WORRIES = [
  { key: "A hospital stay", parent: "Sends a photo of the discharge papers.", ai: "Sorts the papers and lists what the insurer still needs.", person: "Chases the hospital and builds the claim file.", you: "Approve before anything is filed.", note: "The insurer decides the claim. Doctors decide care. We carry the paperwork." },
  { key: "Bills piling up", parent: "Forwards the bill on WhatsApp.", ai: "Reads the amount and due date.", person: "Checks it and pays once you agree.", you: "Say yes, then have 5 minutes to change your mind.", note: "We never hold your money or your parents' money." },
  { key: "A policy lapsing", parent: "Shares the policy, once.", ai: "Finds the renewal date and tracks it.", person: "Confirms the premium and reminds the family.", you: "Approve the renewal.", note: "We do not sell insurance, and we take no commission." },
  { key: "Lost paperwork", parent: "Sends whatever they find.", ai: "Pulls out key facts, and flags what it is unsure of.", person: "Checks anything under 90% sure.", you: "See it all in one private vault.", note: "Each document needs consent. Every look is written down." },
  { key: "Errands at home", parent: "Sends a voice note in their own language.", ai: "Turns it into a clear task.", person: "Books the visit and follows up.", you: "Approve any cost, and see the hours used.", note: "Every minute is counted against your plan." },
];

const LANES = [
  { field: "parent", label: "Your parent", Icon: IconMessage },
  { field: "ai", label: "The assistant", Icon: IconSpark },
  { field: "person", label: "Your coordinator", Icon: IconPerson },
  { field: "you", label: "You", Icon: IconCheck },
] as const;

/** Pick what is on your mind and see who does what. */
export function WorryPicker() {
  const [picked, setPicked] = useState(0);
  const w = WORRIES[picked];
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a worry">
        {WORRIES.map((x, i) => (
          <button key={x.key} type="button" aria-pressed={picked === i} onClick={() => setPicked(i)} className="relative min-h-12 rounded-full border border-line px-5 font-semibold">
            {picked === i && <m.span layoutId="worry-pill" transition={spring.snappy} className="absolute inset-0 rounded-full bg-accent" />}
            <span className={`relative ${picked === i ? "text-on-accent" : ""}`}>{x.key}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <m.div key={w.key} className="grid gap-4" exit={{ opacity: 0 }} transition={{ duration: dur.fast }} aria-live="polite">
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {LANES.map(({ field, label, Icon }, i) => (
              <m.li key={field} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.slow, ease: ease.out, delay: staggerDelay(i) * 2 }} className="card grid content-start gap-2">
                <span className={`grid size-11 place-items-center rounded-full ${field === "you" ? "bg-accent text-on-accent" : "bg-tint text-accent"}`}><Icon size={20} /></span>
                <h3 className="text-[length:var(--text-small)] font-semibold text-muted">{label}</h3>
                <p className="text-[length:var(--text-h3)] font-semibold leading-snug">{w[field]}</p>
              </m.li>
            ))}
          </ol>
          <p className="text-muted">{w.note}</p>
        </m.div>
      </AnimatePresence>
    </div>
  );
}
