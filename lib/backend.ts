import type { NextRequest } from "next/server";
import { demoLoginEnabled } from "./demo-login";

type Env = Record<string, string | undefined>;

/** True once the deployment has its database and Auth settings. Without them, accounts stay closed. */
export function backendReady(env: Env = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.DATABASE_URL);
}

/** Google must also be switched on in Supabase, so the button stays hidden until GOOGLE_SIGNIN=1 says it is. */
export function googleSignInEnabled(env: Env = process.env): boolean {
  return env.GOOGLE_SIGNIN === "1" && backendReady(env);
}

/** Supabase's built-in email only reaches your own team, so the form is hidden until a real mail sender is set up. */
export function emailSignInEnabled(env: Env = process.env): boolean {
  return env.EMAIL_SIGNIN !== "0";
}

/** Where Auth should send people back to. Locally, the address in the browser, so its cookies stay with it. */
export function authBase(req: Pick<NextRequest, "headers" | "nextUrl">): string {
  if (demoLoginEnabled()) return `http://${req.headers.get("host")}`;
  return process.env.APP_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;
}
