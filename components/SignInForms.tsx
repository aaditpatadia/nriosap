"use client";

import { useActionState } from "react";
import { sendMagicLink, staffSignIn } from "@/app/signin/actions";

export function SignInForms({ next }: { next: string }) {
  const [link, linkAction, linkPending] = useActionState(sendMagicLink, null);
  const [staff, staffAction, staffPending] = useActionState(staffSignIn, null);
  return (
    <>
      <section aria-labelledby="family-in" className="card grid gap-4">
        <h2 id="family-in" className="text-[length:var(--text-h2)] font-bold">For families</h2>
        <p className="text-muted">We email you a link. No password to remember.</p>
        <form action={linkAction} className="grid gap-4">
          <input type="hidden" name="next" value={next} />
          <label className="field">Your email<input className="input" type="email" name="email" autoComplete="email" required /></label>
          <button className="btn btn-primary" disabled={linkPending}>{linkPending ? "Sending..." : "Email me a link"}</button>
          <p role="status" aria-live="polite" className={link?.ok ? "text-ok" : "text-danger"}>{link?.message}</p>
        </form>
      </section>
      <section aria-labelledby="desk-in" className="card grid gap-4">
        <h2 id="desk-in" className="text-[length:var(--text-h2)] font-bold">For the desk team</h2>
        <form action={staffAction} className="grid gap-4">
          <input type="hidden" name="next" value={next === "/home" ? "/ops" : next} />
          <label className="field">Work email<input className="input" type="email" name="email" autoComplete="username" required /></label>
          <label className="field">Password<input className="input" type="password" name="password" autoComplete="current-password" required /></label>
          <button className="btn btn-secondary" disabled={staffPending}>{staffPending ? "Signing in..." : "Sign in to the desk"}</button>
          <p role="status" aria-live="polite" className="text-danger">{staff?.message}</p>
        </form>
      </section>
    </>
  );
}
