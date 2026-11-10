"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Shown when a page could not load. Says so plainly and offers another try. Nothing private is shown. */
export function ErrorState({ reset, digest }: { reset: () => void; digest?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <section className="card grid max-w-xl gap-3" role="alert">
      <h1 className="text-[length:var(--text-h2)] font-bold">We could not load this page.</h1>
      <p className="text-[length:var(--text-small)] text-muted">Your information is safe. This is usually a brief connection problem. Please try again in a moment.</p>
      <button type="button" className="btn btn-primary w-fit" disabled={pending} onClick={() => start(() => { router.refresh(); reset(); })}>{pending ? "Trying again..." : "Try again"}</button>
      {digest && <p className="text-[length:var(--text-micro)] text-muted">Reference for the Ally team: {digest}</p>}
    </section>
  );
}
