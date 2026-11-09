"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { IconCheck, IconMessage, IconPerson, IconSpark } from "./Icons";
import { ease, spring } from "@/lib/motion";
import { useMotionPaused } from "@/lib/motion-pref";

const STORIES = [
  { tab: "Property", title: "Property tax on a flat", rows: ["Please pay the property tax on our Pune flat.", "Found the bill: Rs 18,400, due in 12 days.", "Meera checked the owner name and ward.", "Pay property tax: Rs 18,400?"], done: "Paid after your yes. Receipt saved." },
  { tab: "Papers", title: "A certified copy", rows: ["I need a certified copy of my degree.", "Listed what the university asks for.", "Meera booked the counter visit.", "Approve the Rs 850 fee?"], done: "Collected after your yes. Scan saved." },
  { tab: "Parents", title: "An electricity bill", rows: ["Bijli ka bill aaya hai. Photo bhej rahi hoon.", "Read the bill: Rs 4,200, due in 6 days.", "Meera checked the consumer number.", "Pay electricity bill: Rs 4,200?"], done: "Paid after your yes. Mum has been told." },
  { tab: "Repairs", title: "A leak at home", rows: ["The flat has a leak. The tenant sent a video.", "Added a task with your plan's hours.", "Meera booked a plumber visit.", "Book the visit for Rs 600?"], done: "Booked after your yes. Fixed and photographed." },
];

const WHO = [
  { name: "Asked on WhatsApp", Icon: IconMessage },
  { name: "The assistant prepares", Icon: IconSpark },
  { name: "Your coordinator checks", Icon: IconPerson },
  { name: "Only you decide", Icon: IconCheck },
];

/** A looping story of one task moving from parent to desk to you. Each layer drifts a little with the pointer. */
export function HeroScene() {
  const [story, setStory] = useState(0);
  const [beat, setBeat] = useState(0);
  const reduce = useReducedMotion();
  const paused = useMotionPaused();
  const still = !!reduce || paused;

  useEffect(() => {
    if (still) return;
    const t = setTimeout(() => {
      if (beat < 4) return setBeat(beat + 1);
      setBeat(0);
      setStory((s) => (s + 1) % STORIES.length);
    }, beat === 4 ? 2800 : 1250);
    return () => clearTimeout(t);
  }, [beat, story, still]);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 60, damping: 18 });
  const sy = useSpring(py, { stiffness: 60, damping: 18 });
  const backX = useTransform(sx, (v) => v * -10);
  const backY = useTransform(sy, (v) => v * -10);
  const frontX = useTransform(sx, (v) => v * 14);
  const frontY = useTransform(sy, (v) => v * 14);

  function drift(e: React.PointerEvent<HTMLDivElement>) {
    if (still || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  }

  const s = STORIES[story];
  const shown = still ? 3 : Math.min(beat, 3);
  const finished = still || beat === 4;

  return (
    <div className="relative" onPointerMove={drift} onPointerLeave={() => { px.set(0); py.set(0); }}>
      <m.div aria-hidden style={{ x: backX, y: backY }} className="scene-back" />
      <m.div style={{ x: frontX, y: frontY }} className="card relative grid gap-3" aria-label="Example of one task moving through the desk">
        <div className="grid grid-cols-4 gap-1 rounded-full bg-tint p-1" role="group" aria-label="Choose an example">
          {STORIES.map((t, i) => (
            <button key={t.tab} type="button" aria-pressed={story === i} onClick={() => { setStory(i); setBeat(0); }} className="relative min-h-12 rounded-full text-[length:var(--text-micro)] font-semibold">
              {story === i && <m.span layoutId="hero-tab" transition={spring.snappy} className="absolute inset-0 rounded-full bg-accent" />}
              <span className={`relative ${story === i ? "text-on-accent" : ""}`}>{t.tab}</span>
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <m.ol key={story} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="grid gap-2">
            {s.rows.map((row, i) => {
              const { name, Icon } = WHO[i];
              const on = i <= shown;
              return (
                <m.li key={row} initial={false} animate={{ opacity: on ? 1 : 0, x: on ? 0 : 14 }} transition={{ duration: 0.36, ease: ease.out }} className="flex items-start gap-3 rounded-[var(--radius-control)] bg-tint p-3">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full ${i === 3 ? "bg-accent text-on-accent" : "bg-surface text-accent"}`}><Icon size={18} /></span>
                  <span className="min-w-0">
                    <span className="block text-[length:var(--text-micro)] text-muted">{name}</span>
                    <span className="block font-semibold leading-snug">{row}</span>
                  </span>
                </m.li>
              );
            })}
          </m.ol>
        </AnimatePresence>
        <div className="min-h-12" aria-live="off">
          <m.p initial={false} animate={{ opacity: finished ? 1 : 0, scale: finished ? 1 : 0.96 }} transition={spring.gentle} className="chip" data-tone="ok">
            <IconCheck size={16} /> {s.done}
          </m.p>
        </div>
        <p className="text-[length:var(--text-micro)] text-muted">Illustrative example with a fictional family. {s.title}.</p>
      </m.div>
    </div>
  );
}
