"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { recordOnboarding } from "@/app/actions";
import { dur, ease, spring } from "@/lib/motion";

const STEPS = ["Your parent", "Consent", "Documents"] as const;

export function OnboardingForm() {
  const [step, setStep] = useState(0);
  // Values live in state so they survive the step animation remounting its children.
  const [v, setV] = useState({ parentName: "", phone: "", language: "Hindi", consentRead: false, consentAct: false });
  const [state, action, pending] = useActionState(recordOnboarding, null);

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="parentName" value={v.parentName} />
      <input type="hidden" name="phone" value={v.phone} />
      <input type="hidden" name="language" value={v.language} />
      {v.consentRead && <input type="hidden" name="consentRead" value="on" />}
      {v.consentAct && <input type="hidden" name="consentAct" value="on" />}
      <ol className="flex gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <m.div className="h-full origin-left rounded-full bg-accent" initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} transition={spring.calm} />
            </div>
            <span className={`mt-1 block text-[length:var(--text-micro)] ${i === step ? "font-semibold" : "text-muted"}`}>{i + 1}. {s}</span>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <m.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: dur.base, ease: ease.out }} className="grid gap-4">
          <div hidden={step !== 0} className="grid gap-4">
            <label className="field">Parent's name<input className="input" value={v.parentName} onChange={(e) => setV({ ...v, parentName: e.target.value })} required /></label>
            <label className="field">Parent's WhatsApp number<input className="input" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} inputMode="tel" placeholder="+91..." required /></label>
            <label className="field">Language they are most comfortable in
              <select className="input" value={v.language} onChange={(e) => setV({ ...v, language: e.target.value })}>
                <option>Hindi</option><option>Gujarati</option><option>Marathi</option><option>English</option>
              </select>
            </label>
          </div>
          <div hidden={step !== 1} className="grid gap-3">
            <p>We need two kinds of consent. A coordinator will also confirm with your parent by phone, in their own language, before we start.</p>
            <label className="flex items-start gap-3"><input type="checkbox" checked={v.consentRead} onChange={(e) => setV({ ...v, consentRead: e.target.checked })} className="mt-2 size-6" /><span>My parent agrees that the desk may read and store their documents.</span></label>
            <label className="flex items-start gap-3"><input type="checkbox" checked={v.consentAct} onChange={(e) => setV({ ...v, consentAct: e.target.checked })} className="mt-2 size-6" /><span>I agree the desk may prepare tasks for my approval. Nothing is paid or sent without me.</span></label>
            <p className="text-[length:var(--text-small)] text-muted">You can withdraw consent at any time with one message. Your data can be exported or deleted.</p>
          </div>
          <div hidden={step !== 2} className="grid gap-3">
            <p>You can add the first documents later on WhatsApp. Useful to start: health policy, recent reports, bills.</p>
            <p className="text-[length:var(--text-small)] text-muted">This demo does not upload files.</p>
          </div>
        </m.div>
      </AnimatePresence>

      <div className="flex flex-wrap gap-3">
        {step > 0 && <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>Back</button>}
        {step < 2 && <button type="button" className="btn btn-primary" disabled={step === 0 && (v.parentName.trim().length < 2 || v.phone.trim().length < 8)} onClick={() => setStep(step + 1)}>Continue</button>}
        {step === 2 && <button className="btn btn-primary" disabled={pending}>{pending ? "Saving..." : "Finish"}</button>}
      </div>
      <p role="status" aria-live="polite" className={state?.ok ? "text-ok" : "text-danger"}>{state?.message}</p>
    </form>
  );
}
