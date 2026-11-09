import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { authBase } from "@/lib/backend";
import { supabaseServer } from "@/lib/supabase";

/** Finishes magic link and Google sign-in. */
export async function GET(req: NextRequest) {
  const base = authBase(req);
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${safeNext(req.nextUrl.searchParams.get("next"))}`);
  }
  return NextResponse.redirect(`${base}/signin?error=${req.nextUrl.searchParams.get("via") === "google" ? "google" : "link"}`);
}
