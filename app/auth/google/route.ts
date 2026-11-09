import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { authBase, googleSignInEnabled } from "@/lib/backend";
import { supabaseServer } from "@/lib/supabase";

/** Starts Google sign-in. A plain GET link, because the content security policy blocks forms from redirecting off-site. */
export async function GET(req: NextRequest) {
  const base = authBase(req);
  if (!googleSignInEnabled()) return NextResponse.redirect(`${base}/signin`);
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${base}/auth/callback?via=google&next=${encodeURIComponent(next)}`, skipBrowserRedirect: true },
  });
  return NextResponse.redirect(error || !data.url ? `${base}/signin?error=google` : data.url);
}
