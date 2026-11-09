"use client";

import { m, useReducedMotion } from "motion/react";
import { ease } from "@/lib/motion";
import { useMotionPaused } from "@/lib/motion-pref";

const BITS = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2;
  const reach = 64 + (i % 3) * 26;
  return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach, color: ["var(--accent)", "#f2b84b", "var(--ok)"][i % 3] };
});

/** A small burst of dots when something good finishes. */
export function Burst() {
  const reduce = useReducedMotion();
  const paused = useMotionPaused();
  if (reduce || paused) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-10">
      {BITS.map((b) => (
        <m.span key={`${b.x}${b.y}`} className="absolute size-2 rounded-full" style={{ background: b.color }} initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: b.x, y: b.y, opacity: 0, scale: 0.4 }} transition={{ duration: 0.8, ease: ease.out }} />
      ))}
    </span>
  );
}
