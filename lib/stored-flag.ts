"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const memory = new Map<string, boolean>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return memory.get(key) ?? false;
  }
}

/** A remembered on/off setting for this browser. */
export function useStoredFlag(key: string): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => read(key), () => false);
  return [value, (v) => {
    memory.set(key, v);
    try {
      localStorage.setItem(key, v ? "1" : "0");
    } catch {
      // storage can be blocked; memory holds it for this page
    }
    listeners.forEach((fn) => fn());
  }];
}
