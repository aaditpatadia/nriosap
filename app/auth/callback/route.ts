import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

/** Finishes the magic link sign-in. */
export async function GET(req: NextRequest) {
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${safeNext(req.nextUrl.searchParams.get("next"))}`);
  }
  return NextResponse.redirect(`${base}/signin?error=link`);
}
