"use client";

import { useEffect } from "react";
import { LazyMotion, MotionConfig } from "motion/react";
import { useMotionPaused } from "@/lib/motion-pref";

const loadFeatures = () => import("./motionFeatures").then((r) => r.default);

/** One provider: features load after first paint. Reduced motion and the Pause button are respected everywhere. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const paused = useMotionPaused();
  useEffect(() => {
    document.documentElement.dataset.motion = paused ? "paused" : "on";
  }, [paused]);
  return (
    <MotionConfig reducedMotion={paused ? "always" : "user"}>
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
