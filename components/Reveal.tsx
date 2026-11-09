"use client";

import { m, useReducedMotion } from "motion/react";
import { dur, ease } from "@/lib/motion";

/** Fade and rise on first view. Transform and opacity only. */
export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <m.div
      initial={{ opacity: 0, y: reduce ? 0 : 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: reduce ? dur.fast : dur.base, ease: ease.out, delay: reduce ? 0 : delay }}
    >
      {children}
    </m.div>
  );
}
