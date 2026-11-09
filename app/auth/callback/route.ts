import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { demoLoginEnabled } from "@/lib/demo-login";
import { supabaseServer } from "@/lib/supabase";

/** Finishes the magic link sign-in. */
export async function GET(req: NextRequest) {
  // Locally, stay on the address the browser used so the session cookie stays with it.
  const localBase = demoLoginEnabled() ? `http://${req.headers.get("host")}` : undefined;
  const base = localBase ?? process.env.APP_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${safeNext(req.nextUrl.searchParams.get("next"))}`);
  }
  return NextResponse.redirect(`${base}/signin?error=link`);
}
