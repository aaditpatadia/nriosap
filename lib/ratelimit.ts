import "server-only";
import { asService, one } from "./db";
import { log } from "./log";

/** Fixed-window counter in Postgres, so it holds across serverless instances. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const r = await asService(() =>
      one<{ count: number }>(
        `insert into rate_limits(key, window_start, count)
         values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
         on conflict (key, window_start) do update set count = rate_limits.count + 1 returning count`,
        [key, windowSeconds],
      ),
    );
    return (r?.count ?? 0) <= limit;
  } catch {
    // A database outage should not lock people out of signing in.
    log("warn", "rate_limit_unavailable", {});
    return true;
  }
}
