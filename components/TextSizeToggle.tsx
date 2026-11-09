"use client";

import { useEffect, useState } from "react";

export function TextSizeToggle() {
  const [large, setLarge] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("textSize") === "large";
      setLarge(v);
      document.documentElement.dataset.text = v ? "large" : "normal";
    } catch {
      /* storage can be blocked; the page still works */
    }
  }, []);

  function toggle() {
    const next = !large;
    setLarge(next);
    document.documentElement.dataset.text = next ? "large" : "normal";
    try {
      localStorage.setItem("textSize", next ? "large" : "normal");
    } catch {
      /* ignore */
    }
  }

  return (
    <button type="button" className="btn btn-secondary" aria-pressed={large} onClick={toggle}>
      <span aria-hidden>Aa</span>
      <span className="sr-only">Larger text</span>
      <span aria-hidden className="hidden sm:inline">{large ? "Normal text" : "Larger text"}</span>
    </button>
  );
}
