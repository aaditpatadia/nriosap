"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { dur, ease } from "@/lib/motion";

type Toast = { id: number; text: string; tone: "ok" | "danger" };

/** Call from any client component after something saves. Nothing private should go in the text. */
export function toast(text: string, tone: Toast["tone"] = "ok") {
  window.dispatchEvent(new CustomEvent("ally-toast", { detail: { text, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const { text, tone } = (e as CustomEvent<{ text: string; tone: Toast["tone"] }>).detail;
      const id = ++n;
      setItems((list) => [...list.slice(-2), { id, text, tone }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 3600);
    };
    window.addEventListener("ally-toast", on);
    return () => window.removeEventListener("ally-toast", on);
  }, []);
  return (
    <div className="toaster no-print" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <m.p key={t.id} className="toast" data-tone={t.tone} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: dur.base, ease: ease.out }}>{t.text}</m.p>
        ))}
      </AnimatePresence>
    </div>
  );
}
