"use client";

import { useActionState } from "react";
import { sendMagicLink, staffSignIn } from "@/app/signin/actions";

function GoogleMark() {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.2 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function SignInForms({ next, google = false }: { next: string; google?: boolean }) {
  const [link, linkAction, linkPending] = useActionState(sendMagicLink, null);
  const [staff, staffAction, staffPending] = useActionState(staffSignIn, null);
  return (
    <>
      <section aria-labelledby="family-in" className="card grid gap-4">
        <h2 id="family-in" className="text-[length:var(--text-h2)] font-bold">For families</h2>
        {google && (
          <>
            <a className="btn btn-secondary w-full" href={`/auth/google?next=${encodeURIComponent(next)}`}><GoogleMark />Continue with Google</a>
            <p className="text-center text-muted">or</p>
          </>
        )}
        <p className="text-muted">We email you a link. No password to remember.</p>
        <form action={linkAction} className="grid gap-4">
          <input type="hidden" name="next" value={next} />
          <label className="field">Your email<input className="input" type="email" name="email" autoComplete="email" required /></label>
          <button className="btn btn-primary" disabled={linkPending}>{linkPending ? "Sending..." : "Email me a link"}</button>
          <p role="status" aria-live="polite" className={link?.ok ? "text-ok" : "text-danger"}>{link?.message}</p>
          {link?.devLink && <a className="btn btn-primary" href={link.devLink}>Open my sign-in link</a>}
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
