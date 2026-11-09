import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { authBase } from "@/lib/backend";
import { clientIp } from "@/lib/http";
import { rateLimit, signInLimit } from "@/lib/ratelimit";
import { recordFailedLogin } from "@/lib/security-events";
import { supabaseServer } from "@/lib/supabase";

/** Finishes magic link and Google sign-in. */
export async function GET(req: NextRequest) {
  const base = authBase(req);
  const code = req.nextUrl.searchParams.get("code");
  const via = req.nextUrl.searchParams.get("via") === "google" ? "google" : "link";
  const ip = clientIp(req);
  if (code && (await rateLimit(`callback:${ip}`, signInLimit(30), 600))) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${safeNext(req.nextUrl.searchParams.get("next"))}`);
  }
  await recordFailedLogin(via, { ip });
  return NextResponse.redirect(`${base}/signin?error=${via}`);
}
