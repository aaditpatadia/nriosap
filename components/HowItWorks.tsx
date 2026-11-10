"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m, useInView, useReducedMotion } from "motion/react";
import { dur, ease, STAGGER } from "@/lib/motion";

const STEPS = [
  ["Tell Ally what you need", "In your own words, with a photo or a document if you have one."],
  ["Ally organises the request", "It finds the category, the place and what is missing. You check it before it is sent."],
  ["A coordinator takes it on", "A named person in India arranges the right local service provider."],
  ["You stay in control", "You follow progress, approve every cost, and receive proof when it is finished."],
] as const;

const line = (i: number) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: dur.base, ease: ease.out, delay: i * STAGGER * 2 } });

function Scene({ step }: { step: number }) {
  if (step === 0) return (
    <div className="grid gap-3">
      <p className="text-[length:var(--text-small)] font-semibold">What do you need done in India?</p>
      <m.p {...line(0)} className="rounded-[10px] border border-line bg-surface p-4">I need someone to visit my flat in Mumbai because the tenant says there is a water leakage.</m.p>
      <m.div {...line(2)} className="flex gap-2"><span className="chip">Photo added</span><span className="chip">Tenant agreement</span></m.div>
    </div>
  );
  if (step === 1) return (
    <dl className="grid gap-3">
      {[["Category", "Repairs and Local Services"], ["Where", "Mumbai"], ["Urgency", "This week"], ["Still needed", "Who can open the door?"]].map(([k, v], i) => (
        <m.div key={k} {...line(i)} className="flex justify-between gap-4 border-b border-line pb-2"><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></m.div>
      ))}
    </dl>
  );
  if (step === 2) return (
    <ol className="timeline grid gap-4">
      {["Coordinator assigned to your request", "Local plumber identified", "Visit proposed for Thursday morning"].map((t, i) => <m.li key={t} {...line(i * 2)}>{t}<p className="text-[length:var(--text-micro)] text-muted">Example update</p></m.li>)}
    </ol>
  );
  return (
    <div className="grid gap-3">
      <dl className="grid gap-2">
        {[["Provider fee", "Rs 1,000"], ["Ally coordination", "Rs 300"], ["Taxes", "Rs 54"]].map(([k, v], i) => <m.div key={k} {...line(i)} className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="tabular-nums">{v}</dd></m.div>)}
        <m.div {...line(3)} className="flex justify-between border-t border-line pt-2 font-bold"><dt>Total</dt><dd className="tabular-nums">Rs 1,354</dd></m.div>
      </dl>
      <m.div {...line(5)} className="flex flex-wrap items-center gap-2"><span className="chip" data-tone="ok">Approved by you</span><span className="chip">Photos and report received</span></m.div>
    </div>
  );
}

/** Plays through the steps while on screen. Choosing a step stops the auto-play. */
export function HowItWorks() {
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!auto || !visible || reduce || document.documentElement.dataset.motion === "paused") return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 4200);
    return () => clearInterval(t);
  }, [auto, visible, reduce]);
  return (
    <div ref={ref} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
      <ol className="grid">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="border-t border-line">
            <button type="button" aria-pressed={step === i} onClick={() => { setStep(i); setAuto(false); }} className="w-full cursor-pointer bg-transparent py-4 text-left">
              <span className="flex gap-3"><span className={`font-semibold tabular-nums ${step === i ? "text-accent" : "text-muted"}`}>{i + 1}</span><span className="grid gap-1"><span className={`text-[length:var(--text-h2)] font-semibold ${step === i ? "" : "text-muted"}`}>{t}</span><span className="text-[length:var(--text-small)] text-muted">{d}</span></span></span>
            </button>
          </li>
        ))}
      </ol>
      <div className="card min-h-72 p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
        <div className="mb-4 flex items-center justify-between gap-2"><span className="text-[length:var(--text-micro)] font-semibold text-muted">Step {step + 1} of {STEPS.length}</span><span className="chip" data-tone="warn">Example</span></div>
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.fast }}><Scene step={step} /></m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
