"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { actionIp } from "@/lib/action-ip";
import { safeNext } from "@/lib/auth";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/ratelimit";
import { asService, one } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase";

export interface SignInState {
  ok: boolean;
  message: string;
}

async function origin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function sendMagicLink(_prev: SignInState | null, form: FormData): Promise<SignInState> {
  const email = z.string().email().max(200).safeParse(form.get("email"));
  if (!email.success) return { ok: false, message: "Please enter a valid email address." };
  if (!(await rateLimit(`magic:${await actionIp()}`, Number(process.env.RATE_LIMIT_SIGNIN ?? 10), 600))) return { ok: false, message: "Too many tries. Please wait a few minutes." };
  const next = safeNext(form.get("next"));
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email: email.data.toLowerCase(),
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  // Same reply either way, so this form cannot be used to find out who has an account.
  if (error) log("error", "magic_link_failed", { code: error.code ?? "unknown" });
  return { ok: true, message: "Check your email. The link signs you in on this device." };
}

export async function staffSignIn(_prev: SignInState | null, form: FormData): Promise<SignInState> {
  const p = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!p.success) return { ok: false, message: "Please enter your email and password." };
  if (!(await rateLimit(`pw:${await actionIp()}`, Number(process.env.RATE_LIMIT_SIGNIN ?? 10), 600))) return { ok: false, message: "Too many tries. Please wait a few minutes." };
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword({ email: p.data.email.toLowerCase(), password: p.data.password });
  if (error || !data.user) return { ok: false, message: "That email and password did not match." };
  const profile = await asService(() => one<{ role: string }>("select role from profiles where id = $1", [data.user.id]));
  if (profile?.role !== "coordinator" && profile?.role !== "admin") {
    await sb.auth.signOut();
    return { ok: false, message: "That email and password did not match." };
  }
  redirect(safeNext(form.get("next"), "/ops"));
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/signin");
}
