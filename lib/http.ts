import { isLocalHost } from "./cookies";

/** Where to send a plain http request. Null when it is already https or is a local address. */
export function httpsTarget(pathAndQuery: string, proto: string | null, host: string | null): string | null {
  if (proto !== "http" || !host || isLocalHost(host)) return null;
  return `https://${host}${pathAndQuery}`;
}

/** Cookie-authenticated POST routes reject requests that come from another site. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
