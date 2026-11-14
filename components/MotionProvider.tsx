"use client";

import { LazyMotion, MotionConfig } from "motion/react";

const loadFeatures = () => import("./motionFeatures").then((r) => r.default);

/** One provider: features load after first paint. The device's reduce motion setting is respected everywhere. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
