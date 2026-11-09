import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = /^\/(family|ops|chat|onboarding|home)(\/|$)/;
const SIGNED_IN_PAGES = /^\/(family|ops|chat|onboarding|home|signin)(\/|$)/;

function csp(nonce: string | null): string {
  const dev = process.env.NODE_ENV !== "production";
  // Pages that show family data get a strict nonce policy. Static marketing pages have no user data
  // and cannot carry a nonce without giving up static rendering.
  const script = nonce ? `'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}` : `'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`;
  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

/** Sets the content security policy, refreshes the Supabase session and redirects signed-out visitors. */
export async function proxy(req: NextRequest) {
  const nonce = SIGNED_IN_PAGES.test(req.nextUrl.pathname) ? Buffer.from(crypto.randomUUID()).toString("base64") : null;
  const policy = csp(nonce);
  req.headers.set("content-security-policy", policy);
  if (nonce) req.headers.set("x-nonce", nonce);
  const seal = (r: NextResponse) => {
    r.headers.set("content-security-policy", policy);
    return r;
  };

  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return seal(res);

  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getUser();
  if (!data.user && PROTECTED.test(req.nextUrl.pathname)) {
    const to = req.nextUrl.clone();
    to.pathname = "/signin";
    to.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return seal(NextResponse.redirect(to));
  }
  return seal(res);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|api/whatsapp|api/stripe|api/inngest).*)"],
};
