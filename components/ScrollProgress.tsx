"use client";

import { m, useScroll, useSpring } from "motion/react";

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 26, restDelta: 0.001 });
  return <m.div aria-hidden style={{ scaleX }} className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-accent" />;
}
