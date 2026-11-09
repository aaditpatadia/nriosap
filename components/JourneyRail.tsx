"use client";

import { useRef } from "react";
import { m, useScroll, useSpring } from "motion/react";
import { Reveal } from "./Reveal";

/** The steps sit on a thread that fills as you scroll. The fill is a scale transform. */
export function JourneyRail({ steps }: { steps: string[][] }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 60%"] });
  const scaleY = useSpring(scrollYProgress, { stiffness: 90, damping: 24, restDelta: 0.001 });
  return (
    <ol ref={ref} className="relative grid gap-8 pl-14 md:pl-20">
      <span aria-hidden className="absolute bottom-2 left-[21px] top-2 w-[3px] rounded-full bg-line md:left-[29px]" />
      <m.span aria-hidden style={{ scaleY }} className="absolute bottom-2 left-[21px] top-2 w-[3px] origin-top rounded-full bg-accent md:left-[29px]" />
      {steps.map(([t, d], i) => (
        <li key={t} className="relative">
          <span aria-hidden className="absolute -left-14 top-0 grid size-11 place-items-center rounded-full bg-accent font-bold text-on-accent md:-left-20 md:size-[60px] md:text-xl">{i + 1}</span>
          <Reveal delay={i * 0.04}>
            <h3 className="text-[length:var(--text-h2)] font-bold">{t}</h3>
            <p className="mt-2 max-w-3xl text-muted">{d}</p>
          </Reveal>
        </li>
      ))}
    </ol>
  );
}
