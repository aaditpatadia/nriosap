"use client";

import { IconPause, IconPlay } from "./Icons";
import { setMotionPaused, useMotionPaused } from "@/lib/motion-pref";

/** Anything that moves for more than a few seconds must be stoppable. This stops all of it. */
export function MotionToggle() {
  const paused = useMotionPaused();
  return (
    <button type="button" className="btn btn-secondary btn-icon" aria-pressed={paused} aria-label="Pause motion" onClick={() => setMotionPaused(!paused)}>
      {paused ? <IconPlay /> : <IconPause />}
    </button>
  );
}
