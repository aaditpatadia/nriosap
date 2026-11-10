import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { escapeLiteral, Pool, types, type PoolClient, type QueryResultRow } from "pg";

// bigint and numeric come back as numbers; these columns hold rupees, minutes and small decimals.
types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);
// Plain dates stay as YYYY-MM-DD. Turning them into a Date would shift them by the server's time zone.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1184, (v) => new Date(v).toISOString());

export type DbContext = { kind: "user"; id: string } | { kind: "anon" } | { kind: "service" };

const globalForPool = globalThis as unknown as { __gsPool?: Pool };

function pool(): Pool {
  if (!globalForPool.__gsPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const ca = process.env.DATABASE_CA_CERT;
    globalForPool.__gsPool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX ?? 5),
      idleTimeoutMillis: 20_000,
      ssl: process.env.DATABASE_SSL === "disable" ? undefined : ca ? { ca: Buffer.from(ca, "base64").toString() } : { rejectUnauthorized: false },
    });
  }
  return globalForPool.__gsPool;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);

const scope = new AsyncLocalStorage<DbContext>();

/** Runs fn with an explicit database identity. Used by tests, the webhook and background jobs. */
export const withContext = <T>(ctx: DbContext, fn: () => Promise<T>) => scope.run(ctx, fn);
export const asService = <T>(fn: () => Promise<T>) => withContext({ kind: "service" }, fn);

let resolveDefault: () => Promise<DbContext> = async () => ({ kind: "anon" });
/** lib/auth.ts registers the session lookup here, which keeps this module free of Next imports. */
export function setDefaultContextResolver(fn: () => Promise<DbContext>) {
  resolveDefault = fn;
}

export const currentContext = async () => scope.getStore() ?? resolveDefault();

export interface Tx {
  rows<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<number>;
}

function wrap(c: PoolClient): Tx {
  return {
    rows: async <T extends QueryResultRow>(sql: string, params: unknown[] = []) => (await c.query<T>(sql, params)).rows,
    one: async <T extends QueryResultRow>(sql: string, params: unknown[] = []) => (await c.query<T>(sql, params)).rows[0],
    run: async (sql, params = []) => (await c.query(sql, params)).rowCount ?? 0,
  };
}

/**
 * Every query runs in a transaction under the caller's identity, so Postgres RLS applies to all
 * user requests. Only the service context skips the role switch.
 */
export async function tx<T>(fn: (t: Tx) => Promise<T>, ctx?: DbContext): Promise<T> {
  const who = ctx ?? (await currentContext());
  const client = await pool().connect();
  try {
    if (who.kind === "service") {
      await client.query("begin");
    } else {
      const claims = who.kind === "user" ? JSON.stringify({ sub: who.id, role: "authenticated" }) : "";
      const role = who.kind === "user" ? "authenticated" : "anon";
      await client.query(`begin; set local role ${role}; select set_config('request.jwt.claims', ${escapeLiteral(claims)}, true);`);
    }
    const out = await fn(wrap(client));
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export const rows = <T extends QueryResultRow>(sql: string, params?: unknown[]) => tx((t) => t.rows<T>(sql, params));
export const one = <T extends QueryResultRow>(sql: string, params?: unknown[]) => tx((t) => t.one<T>(sql, params));
export const run = (sql: string, params?: unknown[]) => tx((t) => t.run(sql, params));
