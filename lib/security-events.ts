import "server-only";
import { createHash } from "node:crypto";
import { asService, tx } from "./db";
import { log } from "./log";
import { hitCount } from "./ratelimit";

const WINDOW_SECONDS = 600;
const ACCOUNT_THRESHOLD = 5;
const IP_THRESHOLD = 10;

export type FailedLoginMethod = "password" | "link" | "google" | "rate_limited";

/** A stable reference for an email or IP, so logs and alerts can link events without holding the value. */
export function fingerprint(value: string): string {
  return createHash("sha256").update(`${process.env.APP_ENCRYPTION_KEY ?? "ally"}:${value.trim().toLowerCase()}`).digest("hex").slice(0, 16);
}

async function raiseAlert(scope: string, ref: string, count: number) {
  const bucket = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  await asService(() =>
    tx((t) =>
      t.run("insert into alerts(family_id, kind, dedupe_key, body) values (null,'security',$1,$2) on conflict (dedupe_key) do nothing", [
        `login:${scope}:${ref}:${bucket}`,
        `${count} failed sign-ins in 10 minutes from one ${scope}. Reference ${ref}. If this was not your team, change that password.`,
      ]),
    ),
  );
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureMessage(`Repeated failed sign-ins from one ${scope}`, "warning");
  }
}

/** Writes a failed sign-in to the logs and audit trail, and alerts admins when they repeat. Never blocks sign-in. */
export async function recordFailedLogin(method: FailedLoginMethod, who: { email?: string; ip: string }): Promise<void> {
  try {
    const account = who.email ? fingerprint(who.email) : null;
    const ip = fingerprint(who.ip);
    log("warn", "login_failed", { method, account: account ?? "none", ip });
    await asService(() => tx((t) => t.run("insert into audit_log(action, entity, entity_id) values ($1,'auth',$2)", [`login_failed:${method}`, account ?? ip])));
    if (account) {
      const n = await hitCount(`fail:account:${account}`, WINDOW_SECONDS);
      if (n === ACCOUNT_THRESHOLD) await raiseAlert("account", account, n);
    }
    const n = await hitCount(`fail:ip:${ip}`, WINDOW_SECONDS);
    if (n === IP_THRESHOLD) await raiseAlert("address", ip, n);
  } catch {
    log("error", "login_failure_not_recorded", {});
  }
}
