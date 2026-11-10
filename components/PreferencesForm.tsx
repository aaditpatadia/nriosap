"use client";

import { useActionState } from "react";
import { savePreferencesAction } from "@/app/family/platform-actions";
import type { Preferences } from "@/lib/family-members";

export function PreferencesForm({ prefs }: { prefs: Preferences }) {
  const [state, action, pending] = useActionState(savePreferencesAction, null);
  return (
    <form action={action} className="card grid gap-4">
      <h2 className="section-title">Your preferences</h2>
      <label className="field">Country you live in<input className="input" name="country" maxLength={80} defaultValue={prefs.country ?? ""} /></label>
      <label className="field">Cities in India (separate with commas)<input className="input" name="cities" maxLength={300} defaultValue={prefs.indiaCities.join(", ")} /></label>
      <label className="field">Preferred language
        <select className="input" name="language" defaultValue={prefs.language ?? "English"}><option>English</option><option>Hindi</option><option>Gujarati</option><option>Marathi</option></select>
      </label>
      <label className="field">How should we reach you?
        <select className="input" name="channel" defaultValue={prefs.channel ?? "whatsapp"}><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="app">Only in the app</option></select>
      </label>
      <label className="field">Time zone<input className="input" name="timezone" maxLength={60} defaultValue={prefs.timezone ?? ""} placeholder="America/New_York" /></label>
      <label className="flex min-h-12 items-center gap-3"><input type="checkbox" name="notifyUpdates" className="size-6" defaultChecked={prefs.notifyUpdates} /><span>Tell me about updates</span></label>
      <button className="btn btn-primary w-fit" disabled={pending}>Save</button>
      <p role="status" aria-live="polite" className={state?.ok ? "text-ok" : "text-danger"}>{state?.message}</p>
    </form>
  );
}
