import "server-only";
import { asService, one } from "./db";
import { log } from "./log";

/** Fixed-window counter in Postgres, so it holds across serverless instances. Returns the count so far. */
export async function hitCount(key: string, windowSeconds: number): Promise<number> {
  const r = await asService(() =>
    one<{ count: number }>(
      `insert into rate_limits(key, window_start, count)
       values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
       on conflict (key, window_start) do update set count = rate_limits.count + 1 returning count`,
      [key, windowSeconds],
    ),
  );
  return r?.count ?? 0;
}

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    return (await hitCount(key, windowSeconds)) <= limit;
  } catch {
    // A database outage should not lock people out of signing in. Supabase Auth has its own limits behind this.
    log("warn", "rate_limit_unavailable", {});
    return true;
  }
}

/** Sign-in limits. RATE_LIMIT_SIGNIN overrides them for the local test suite only. */
export const signInLimit = (fallback: number) => Number(process.env.RATE_LIMIT_SIGNIN ?? fallback);
