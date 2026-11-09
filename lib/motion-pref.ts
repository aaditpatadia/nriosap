"use client";

import { useSyncExternalStore } from "react";

const KEY = "motion";
const listeners = new Set<() => void>();
let memory = false; // used when the browser blocks storage

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "paused";
  } catch {
    return memory;
  }
}

/** True when the visitor pressed Pause motion. The system reduced motion setting is handled separately. */
export const useMotionPaused = () => useSyncExternalStore(subscribe, read, () => false);

export function setMotionPaused(paused: boolean) {
  memory = paused;
  try {
    localStorage.setItem(KEY, paused ? "paused" : "on");
  } catch {
    // storage can be blocked; memory holds it for this page
  }
  listeners.forEach((fn) => fn());
}
