import type { CookieOptions } from "@supabase/ssr";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return LOCAL_HOSTS.includes(name.toLowerCase());
}

/** The local Auth emulator runs on plain http. Everything else must use Secure cookies. */
function usesLocalAuth(env: Record<string, string | undefined>): boolean {
  try {
    return isLocalHost(new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "").host);
  } catch {
    return false;
  }
}

/**
 * Applied to every session cookie. Auth only ever runs on the server here, so page scripts
 * have no reason to read these and a script injected into a page cannot steal a session.
 */
export function hardenCookie(options: CookieOptions = {}, env: Record<string, string | undefined> = process.env): CookieOptions {
  return { ...options, httpOnly: true, secure: !usesLocalAuth(env), sameSite: "lax", path: options.path ?? "/" };
}
