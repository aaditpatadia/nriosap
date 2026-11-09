"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { recordOnboarding } from "@/app/actions";
import { OWNER_CONSENT_TEXT, PLAN_NAME, PLAN_PRICES, REQUIRED_PURPOSES } from "@/lib/consent";
import { dur, ease, spring } from "@/lib/motion";
import { PURPOSES, type Purpose } from "@/lib/upload-rules";

const STEPS = ["Your parent", "Your plan", "Consent"] as const;

export function OnboardingForm() {
  const [step, setStep] = useState(0);
  // Values live in state so they survive the step animation remounting its children.
  const [v, setV] = useState({ parentName: "", phone: "", language: "Hindi", city: "", plan: "79" });
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [state, action, pending] = useActionState(recordOnboarding, null);
  const canFinish = REQUIRED_PURPOSES.every((r) => purposes.includes(r));

  return (
    <form action={action} className="grid gap-6">
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
              <label className="field">Parent&apos;s name<input className="input" value={v.parentName} onChange={(e) => setV({ ...v, parentName: e.target.value })} required /></label>
              <label className="field">Parent&apos;s WhatsApp number<input className="input" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} inputMode="tel" placeholder="+91 98000 00000" required /></label>
              <label className="field">City in India<input className="input" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} required /></label>
              <label className="field">Language they are most comfortable in
                <select className="input" value={v.language} onChange={(e) => setV({ ...v, language: e.target.value })}>
                  <option>Hindi</option><option>Gujarati</option><option>Marathi</option><option>English</option>
                </select>
              </label>
            </div>
          )}
          {step === 1 && (
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
          {step === 2 && (
            <fieldset className="grid gap-3">
              <legend className="mb-1">We ask for each one separately. A coordinator will also call your parent, in their own language, before we start.</legend>
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
        {step < 2 && <button type="button" className="btn btn-primary" disabled={step === 0 && (v.parentName.trim().length < 2 || v.phone.trim().length < 8 || v.city.trim().length < 2)} onClick={() => setStep(step + 1)}>Continue</button>}
        {step === 2 && <button className="btn btn-primary" disabled={pending || !canFinish}>{pending ? "Saving..." : "Finish"}</button>}
      </div>
      <p role="status" aria-live="polite" className={state?.ok ? "text-ok" : "text-danger"}>{state?.message}</p>
    </form>
  );
}
