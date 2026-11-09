"use client";

import { m, useReducedMotion, useSpring } from "motion/react";

/** Leans toward a mouse pointer. Touch screens and reduced motion get a still card. */
export function TiltCard({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  const rotateX = useSpring(0, { stiffness: 180, damping: 18 });
  const rotateY = useSpring(0, { stiffness: 180, damping: 18 });
  function move(e: React.PointerEvent<HTMLElement>) {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    rotateY.set(((e.clientX - r.left) / r.width - 0.5) * 7);
    rotateX.set(((e.clientY - r.top) / r.height - 0.5) * -7);
  }
  function leave() {
    rotateX.set(0);
    rotateY.set(0);
  }
  return (
    <m.article onPointerMove={move} onPointerLeave={leave} style={{ rotateX, rotateY, transformPerspective: 900, ...style }} className={className}>
      {children}
    </m.article>
  );
}
