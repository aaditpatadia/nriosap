/** Server-side error tracking only. Nothing is sent unless SENTRY_DSN is set. */
export async function register() {
  if (!process.env.SENTRY_DSN || process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  const { scrubEvent } = await import("./lib/scrub");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeSend: (event) => scrubEvent(event),
  });
}

export async function onRequestError(...args: unknown[]) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  (Sentry.captureRequestError as (...a: unknown[]) => void)(...args);
}
