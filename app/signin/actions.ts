"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { actionIp } from "@/lib/action-ip";
import { safeNext } from "@/lib/auth";
import { DEMO_DOMAIN, DEMO_PEOPLE, demoLoginEnabled } from "@/lib/demo-login";
import { log } from "@/lib/log";
import { rateLimit, signInLimit } from "@/lib/ratelimit";
import { fingerprint, recordFailedLogin } from "@/lib/security-events";
import { asService, one } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase";

export interface SignInState {
  ok: boolean;
  message: string;
  devLink?: string;
}

async function origin() {
  // Locally the address in the browser wins, so 127.0.0.1 and localhost both keep their cookies.
  if (process.env.APP_URL && !demoLoginEnabled()) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** The local emulator keeps the link instead of emailing it. */
async function localInboxLink(email: string): Promise<string | undefined> {
  if (!demoLoginEnabled()) return undefined;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/__inbox?email=${encodeURIComponent(email)}`, { cache: "no-store" });
  return ((await res.json()) as { link?: string }).link ?? undefined;
}

/** Local demos only: one click to sign in as a seeded person, through the same Auth calls as real sign-in. */
export async function demoSignIn(form: FormData): Promise<void> {
  const person = DEMO_PEOPLE.find((p) => p.id === form.get("who"));
  if (!demoLoginEnabled() || !person) redirect("/signin");
  const email = `${person.id}@${DEMO_DOMAIN}`;
  const sb = await supabaseServer();
  if (person.staff) {
    const { error } = await sb.auth.signInWithPassword({ email, password: process.env.SEED_STAFF_PASSWORD ?? "" });
    redirect(error ? "/signin?error=demo" : "/ops");
  }
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${await origin()}/auth/callback?next=%2Fhome` } });
  const link = error ? undefined : await localInboxLink(email);
  redirect(link ?? "/signin?error=demo");
}

export async function sendMagicLink(_prev: SignInState | null, form: FormData): Promise<SignInState> {
  const email = z.string().email().max(200).safeParse(form.get("email"));
  if (!email.success) return { ok: false, message: "Please enter a valid email address." };
  const ip = await actionIp();
  // One limit per address and one per mailbox, so nobody can flood a person's inbox from many addresses.
  if (!(await rateLimit(`magic:${ip}`, signInLimit(10), 600)) || !(await rateLimit(`magic-account:${fingerprint(email.data)}`, signInLimit(5), 600))) {
    await recordFailedLogin("rate_limited", { email: email.data, ip });
    return { ok: false, message: "Too many tries. Please wait a few minutes." };
  }
  const next = safeNext(form.get("next"));
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email: email.data.toLowerCase(),
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  // Same reply either way, so this form cannot be used to find out who has an account.
  if (error) log("error", "magic_link_failed", { code: error.code ?? "unknown" });
  const devLink = error ? undefined : await localInboxLink(email.data.toLowerCase());
  return { ok: true, message: devLink ? "Check your email. This local setup sends no email, so use the button below." : "Check your email. The link signs you in on this device.", devLink };
}

export async function staffSignIn(_prev: SignInState | null, form: FormData): Promise<SignInState> {
  const p = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!p.success) return { ok: false, message: "Please enter your email and password." };
  const ip = await actionIp();
  // The account limit stops slow guessing of one password from many addresses.
  if (!(await rateLimit(`pw:${ip}`, signInLimit(10), 600)) || !(await rateLimit(`pw-account:${fingerprint(p.data.email)}`, signInLimit(8), 900))) {
    await recordFailedLogin("rate_limited", { email: p.data.email, ip });
    return { ok: false, message: "Too many tries. Please wait a few minutes." };
  }
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword({ email: p.data.email.toLowerCase(), password: p.data.password });
  if (error || !data.user) {
    await recordFailedLogin("password", { email: p.data.email, ip });
    return { ok: false, message: "That email and password did not match." };
  }
  const profile = await asService(() => one<{ role: string }>("select role from profiles where id = $1", [data.user.id]));
  if (profile?.role !== "coordinator" && profile?.role !== "admin") {
    await sb.auth.signOut();
    await recordFailedLogin("password", { email: p.data.email, ip });
    return { ok: false, message: "That email and password did not match." };
  }
  redirect(safeNext(form.get("next"), "/ops"));
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/signin");
}
