"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { recordOnboarding } from "@/app/actions";
import { OWNER_CONSENT_TEXT, PLAN_NAME, PLAN_PRICES, REQUIRED_PURPOSES } from "@/lib/consent";
import { dur, ease, spring } from "@/lib/motion";
import { REQUEST_CATEGORIES } from "@/lib/requests";
import { PURPOSES, type Purpose } from "@/lib/upload-rules";

const STEPS = ["Your request", "Who it is for", "Your plan", "Consent"] as const;

export function OnboardingForm() {
  const [step, setStep] = useState(0);
  // Values live in state so they survive the step animation remounting its children.
  const [v, setV] = useState({ category: "", request: "", who: "me", parentName: "", phone: "", language: "English", city: "", plan: "79" });
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [state, action, pending] = useActionState(recordOnboarding, null);
  const canFinish = REQUIRED_PURPOSES.every((r) => purposes.includes(r));
  const self = v.who === "me";
  const blocked =
    (step === 0 && (!v.category || v.request.trim().length < 5)) ||
    (step === 1 && (v.phone.trim().length < 8 || v.city.trim().length < 2 || (!self && v.parentName.trim().length < 2)));

  return (
    <form action={action} className="grid max-w-3xl gap-6">
      {Object.entries(v).map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}
      {purposes.map((p) => <input key={p} type="hidden" name="purpose" value={p} />)}
      <ol className="flex gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <m.div className="h-full origin-left rounded-full bg-accent" initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} transition={spring.calm} />
            </div>
            <span className={`mt-1 block text-[length:var(--text-micro)] ${i === step ? "font-semibold" : "text-muted"}`}>{i + 1}. {s}</span>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <m.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: dur.base, ease: ease.out }} className="grid gap-4">
          {step === 0 && (
            <div className="grid gap-4">
              <div className="flex flex-wrap gap-2" role="group" aria-label="What kind of work is it?">
                {REQUEST_CATEGORIES.map((c) => (
                  <button key={c} type="button" aria-pressed={v.category === c} onClick={() => setV({ ...v, category: c })} className={`min-h-12 rounded-full border px-5 font-semibold ${v.category === c ? "border-accent bg-accent text-on-accent" : "border-line"}`}>{c}</button>
                ))}
              </div>
              <label className="field">What do you need done in India?
                <textarea className="input" rows={4} maxLength={1000} value={v.request} onChange={(e) => setV({ ...v, request: e.target.value })} placeholder="Pay the property tax on our flat in Pune and send me the receipt." required />
              </label>
              <p className="text-[length:var(--text-small)] text-muted">We prepare and get things done. Advice on medical, legal or tax matters comes from licensed professionals.</p>
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-4">
              <fieldset className="grid gap-3 md:grid-cols-2">
                <legend className="mb-2 font-semibold">Who is this for?</legend>
                <label className="card flex min-h-12 items-center gap-3"><input type="radio" name="whoChoice" className="size-6" checked={self} onChange={() => setV({ ...v, who: "me", language: "English" })} /><span>Just me</span></label>
                <label className="card flex min-h-12 items-center gap-3"><input type="radio" name="whoChoice" className="size-6" checked={!self} onChange={() => setV({ ...v, who: "someone", language: "Hindi" })} /><span>Someone back home</span></label>
              </fieldset>
              {!self && <label className="field">Their name<input className="input" value={v.parentName} onChange={(e) => setV({ ...v, parentName: e.target.value })} required /></label>}
              <label className="field">{self ? "Your WhatsApp number" : "Their WhatsApp number"}<input className="input" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} inputMode="tel" placeholder={self ? "+1 416 555 0100" : "+91 98000 00000"} required /></label>
              <label className="field">City in India<input className="input" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} required /></label>
              <label className="field">Language {self ? "you prefer" : "they are most comfortable in"}
                <select className="input" value={v.language} onChange={(e) => setV({ ...v, language: e.target.value })}>
                  <option>English</option><option>Hindi</option><option>Gujarati</option><option>Marathi</option>
                </select>
              </label>
            </div>
          )}
          {step === 2 && (
            <fieldset className="grid gap-3">
              <legend className="font-semibold">Choose a plan. You can change or cancel any time.</legend>
              {PLAN_PRICES.map((p) => (
                <label key={p} className="card flex min-h-12 items-center gap-3">
                  <input type="radio" name="planChoice" className="size-6" checked={v.plan === String(p)} onChange={() => setV({ ...v, plan: String(p) })} />
                  <span><strong>{PLAN_NAME[p]}</strong>: ${p} a month</span>
                </label>
              ))}
            </fieldset>
          )}
          {step === 3 && (
            <fieldset className="grid gap-3">
              <legend className="mb-1">We ask for each one separately.{self ? "" : " A coordinator will also call them, in their own language, before we start."}</legend>
              {PURPOSES.map((p) => (
                <label key={p} className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 size-6 shrink-0" checked={purposes.includes(p)} onChange={(e) => setPurposes(e.target.checked ? [...purposes, p] : purposes.filter((x) => x !== p))} />
                  <span>{OWNER_CONSENT_TEXT[p]}{REQUIRED_PURPOSES.includes(p) ? "" : " (optional)"}</span>
                </label>
              ))}
              <p className="text-[length:var(--text-small)] text-muted">You can withdraw consent at any time. Your data can be exported or deleted.</p>
            </fieldset>
          )}
        </m.div>
      </AnimatePresence>

      <div className="flex flex-wrap gap-3">
        {step > 0 && <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>Back</button>}
        {step < 3 && <button type="button" className="btn btn-primary" disabled={blocked} onClick={() => setStep(step + 1)}>Continue</button>}
        {step === 3 && <button className="btn btn-primary" disabled={pending || !canFinish}>{pending ? "Saving..." : "Finish"}</button>}
      </div>
      <p role="status" aria-live="polite" className={state?.ok ? "text-ok" : "text-danger"}>{state?.message}</p>
    </form>
  );
}
