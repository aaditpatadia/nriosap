"use client";

import { useActionState } from "react";
import { joinWaitlist } from "@/app/actions";

export function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlist, null);
  return (
    <form action={action} className="grid gap-4" aria-describedby="waitlist-status">
      <label className="field">Your email
        <input className="input" type="email" name="email" required autoComplete="email" inputMode="email" />
      </label>
      <label className="field">Where do you live now?
        <input className="input" name="country" required placeholder="Canada, UAE, UK, USA, Singapore..." autoComplete="country-name" />
      </label>
      <label className="field">What worries you most about your parents' paperwork? (optional)
        <textarea className="input" name="note" rows={3} maxLength={400} />
      </label>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Sending..." : "Join the waitlist"}</button>
      <p id="waitlist-status" role="status" aria-live="polite" className={state?.ok ? "text-ok" : "text-danger"}>
        {state?.message}
      </p>
    </form>
  );
}
