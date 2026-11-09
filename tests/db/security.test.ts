import { beforeAll, describe, expect, inject, it } from "vitest";
import pg from "pg";
import { asRole, ID } from "./helpers";

const url = inject("dbUrl");
let db: pg.Client;

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = "disable";
  process.env.APP_ENCRYPTION_KEY = "test-only-encryption-key-at-least-32-bytes";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
  db = new pg.Client({ connectionString: url });
  await db.connect();
});

describe("rate limits", () => {
  it("allow up to the limit and refuse after it", async () => {
    const { rateLimit } = await import("@/lib/ratelimit");
    const out: boolean[] = [];
    for (let i = 0; i < 6; i++) out.push(await rateLimit("test:limit", 5, 3600));
    expect(out).toEqual([true, true, true, true, true, false]);
  });
  it("count each key on its own", async () => {
    const { rateLimit } = await import("@/lib/ratelimit");
    expect(await rateLimit("test:other", 1, 3600)).toBe(true);
    expect(await rateLimit("test:another", 1, 3600)).toBe(true);
  });
});

describe("failed sign-ins", () => {
  const email = "target@example.test";
  const alerts = () => db.query("select id, body from alerts where kind = 'security' and dedupe_key like 'login:account:%'");

  it("are logged in the audit trail without the email address", async () => {
    const { recordFailedLogin, fingerprint } = await import("@/lib/security-events");
    await recordFailedLogin("password", { email, ip: "203.0.113.9" });
    const { rows } = await db.query("select action, entity_id from audit_log where entity = 'auth' and entity_id = $1", [fingerprint(email)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("login_failed:password");
    expect(JSON.stringify(rows)).not.toContain("target@");
  });

  it("raise exactly one alert when they repeat", async () => {
    const { recordFailedLogin } = await import("@/lib/security-events");
    expect((await alerts()).rows).toHaveLength(0);
    for (let i = 0; i < 3; i++) await recordFailedLogin("password", { email, ip: "203.0.113.9" });
    expect((await alerts()).rows).toHaveLength(0);
    for (let i = 0; i < 4; i++) await recordFailedLogin("password", { email, ip: "203.0.113.9" });
    const { rows } = await alerts();
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toContain("failed sign-ins");
    expect(rows[0].body).not.toContain("target@");
    expect(rows[0].body).not.toContain("203.0.113");
  });

  it("alerts can be read by admins only", async () => {
    const count = (c: pg.Client) => c.query("select count(*)::int as n from alerts where kind = 'security'").then((r) => r.rows[0].n as number);
    expect(await asRole(url, "authenticated", ID.admin, count)).toBeGreaterThan(0);
    expect(await asRole(url, "authenticated", ID.coord, count)).toBe(0);
    expect(await asRole(url, "authenticated", ID.owner, count)).toBe(0);
    expect(await asRole(url, "anon", null, count)).toBe(0);
  });
});

describe("accounts and roles", () => {
  it("a signed-in user cannot make themselves an admin", async () => {
    const attempt = asRole(url, "authenticated", ID.owner, (c) => c.query("update profiles set role = 'admin' where id = $1", [ID.owner]).then((r) => r.rowCount));
    const changed = await attempt.catch(() => 0);
    expect(changed).toBe(0);
    const { rows } = await db.query("select role from profiles where id = $1", [ID.owner]);
    expect(rows[0].role).toBe("owner");
  });
  it("the database has no password column of its own", async () => {
    const { rows } = await db.query("select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name ilike '%pass%'");
    expect(rows).toEqual([]);
  });
});
