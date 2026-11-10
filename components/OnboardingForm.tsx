"use client";

import { useActionState, useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { recordOnboarding } from "@/app/actions";
import { OWNER_CONSENT_TEXT, REQUIRED_PURPOSES } from "@/lib/consent";
import { dur, ease, spring } from "@/lib/motion";
import { PURPOSES, type Purpose } from "@/lib/upload-rules";

const STEPS = ["Welcome", "Where you live", "India", "What you need", "Preferences", "Finish"] as const;
const COUNTRIES = ["USA", "UK", "Canada", "UAE", "Australia", "Singapore", "Germany", "Japan"];
const CITIES = ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Ahmedabad", "Pune", "Chennai", "Kolkata", "Surat"];
const NEEDS = ["Property", "Family", "Documents", "Bills", "Purchases", "Repairs", "Business", "Something else"];

function Pill({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={`min-h-12 rounded-full border px-5 font-semibold ${on ? "border-accent bg-accent text-on-accent" : "border-line"}`}>{label}</button>;
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function OnboardingForm() {
  const [step, setStep] = useState(0);
  // Values live in state so they survive the step animation remounting its children.
  const [country, setCountry] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [otherCity, setOtherCity] = useState("");
  const [needs, setNeeds] = useState<string[]>([]);
  const [prefs, setPrefs] = useState({ language: "English", channel: "whatsapp", timezone: "", phone: "" });
  const [notify, setNotify] = useState(true);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  // A lost connection becomes a message on this page. The answers stay in place for another try.
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof recordOnboarding>> | null, form: FormData) => {
    try {
      return await recordOnboarding(prev, form);
    } catch (e) {
      if (String((e as { digest?: string })?.digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
      return { ok: false as const, message: "We could not reach Ally. Please check your connection and press the button again. Your answers are still here." };
    }
  }, null);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setSlow(true), 8000);
    return () => { clearTimeout(t); setSlow(false); };
  }, [pending]);
  const canFinish = REQUIRED_PURPOSES.every((r) => purposes.includes(r));
  const allCities = [...cities, ...otherCity.split(",").map((c) => c.trim()).filter(Boolean)];
  const last = STEPS.length - 1;

  function begin() {
    if (!prefs.timezone) setPrefs({ ...prefs, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    setStep(1);
  }

  return (
    <form action={action} className="grid max-w-3xl gap-6">
      <input type="hidden" name="country" value={country} />
      <input type="hidden" name="cities" value={allCities.join(", ")} />
      {Object.entries(prefs).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {notify && <input type="hidden" name="notifyUpdates" value="on" />}
      {needs.map((n) => <input key={n} type="hidden" name="need" value={n} />)}
      {purposes.map((p) => <input key={p} type="hidden" name="purpose" value={p} />)}
      <ol className="flex gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <m.div className="h-full origin-left rounded-full bg-accent" initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} transition={spring.calm} />
            </div>
            <span className="sr-only">Step {i + 1}: {s}</span>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <m.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: dur.base, ease: ease.out }} className="grid gap-5">
          {step === 0 && (
            <div className="grid gap-3">
              <h1 className="text-[length:var(--text-display)] font-extrabold">Welcome to Ally.</h1>
              <p className="text-[length:var(--text-h3)] text-muted">Let&apos;s get your life back home organised. It takes about a minute, and you can skip the questions you would rather not answer.</p>
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-4">
              <h1 className="text-[length:var(--text-h1)] font-extrabold">Where do you currently live?</h1>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Country">{COUNTRIES.map((c) => <Pill key={c} label={c} on={country === c} onClick={() => setCountry(country === c ? "" : c)} />)}</div>
              <label className="field">Somewhere else<input className="input" maxLength={80} value={COUNTRIES.includes(country) ? "" : country} onChange={(e) => setCountry(e.target.value)} /></label>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-4">
              <h1 className="text-[length:var(--text-h1)] font-extrabold">Where in India do you need help?</h1>
              <p className="text-muted">Choose as many as you like.</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Cities">{CITIES.map((c) => <Pill key={c} label={c} on={cities.includes(c)} onClick={() => setCities(toggle(cities, c))} />)}</div>
              <label className="field">Other cities (separate with commas)<input className="input" maxLength={200} value={otherCity} onChange={(e) => setOtherCity(e.target.value)} /></label>
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-4">
              <h1 className="text-[length:var(--text-h1)] font-extrabold">What do you need help managing?</h1>
              <div className="flex flex-wrap gap-2" role="group" aria-label="What you need">{NEEDS.map((n) => <Pill key={n} label={n} on={needs.includes(n)} onClick={() => setNeeds(toggle(needs, n))} />)}</div>
            </div>
          )}
          {step === 4 && (
            <div className="grid gap-4">
              <h1 className="text-[length:var(--text-h1)] font-extrabold">How should we work with you?</h1>
              <label className="field">Preferred language
                <select className="input" value={prefs.language} onChange={(e) => setPrefs({ ...prefs, language: e.target.value })}><option>English</option><option>Hindi</option><option>Gujarati</option><option>Marathi</option></select>
              </label>
              <label className="field">How should we reach you?
                <select className="input" value={prefs.channel} onChange={(e) => setPrefs({ ...prefs, channel: e.target.value })}><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="app">Only in the app</option></select>
              </label>
              <label className="field">Your WhatsApp number (optional)<input className="input" inputMode="tel" maxLength={24} value={prefs.phone} onChange={(e) => setPrefs({ ...prefs, phone: e.target.value })} placeholder="+1 416 555 0100" /></label>
              <label className="field">Time zone<input className="input" maxLength={60} value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })} /></label>
              <label className="flex min-h-12 items-center gap-3"><input type="checkbox" className="size-6" checked={notify} onChange={(e) => setNotify(e.target.checked)} /><span>Tell me about updates</span></label>
            </div>
          )}
          {step === 5 && (
            <fieldset className="grid gap-3">
              <legend className="mb-2"><span className="block text-[length:var(--text-h1)] font-extrabold">One last thing.</span><span className="text-muted">We ask for each of these separately. The first two are needed before we can hold your documents.</span></legend>
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
        {step === 0 && <button type="button" className="btn btn-primary" onClick={begin}>Get started</button>}
        {step > 0 && step < last && <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>Continue</button>}
        {step === last && <button className="btn btn-primary" disabled={pending || !canFinish}>{pending ? "Setting up..." : "Create my dashboard"}</button>}
      </div>
      <p role="status" aria-live="polite" className={pending ? "text-muted" : "text-danger"}>{pending ? (slow ? "Still working. This is taking longer than usual. Please keep this page open; pressing again will not create a second account." : "") : state?.ok === false ? state.message : ""}</p>
    </form>
  );
}
