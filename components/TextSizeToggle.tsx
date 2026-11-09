"use client";

import { useEffect, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function read(): boolean {
  try {
    return localStorage.getItem("textSize") === "large";
  } catch {
    return false; // storage can be blocked; the page still works
  }
}

export function TextSizeToggle() {
  const large = useSyncExternalStore(subscribe, read, () => false);

  useEffect(() => {
    document.documentElement.dataset.text = large ? "large" : "normal";
  }, [large]);

  function toggle() {
    try {
      localStorage.setItem("textSize", large ? "normal" : "large");
    } catch {
      document.documentElement.dataset.text = large ? "normal" : "large";
    }
    listeners.forEach((fn) => fn());
  }

  return (
    <button type="button" className="btn btn-secondary" aria-pressed={large} onClick={toggle}>
      <span aria-hidden>Aa</span>
      <span className="sr-only">Larger text</span>
      <span aria-hidden className="hidden sm:inline">{large ? "Normal text" : "Larger text"}</span>
    </button>
  );
}
