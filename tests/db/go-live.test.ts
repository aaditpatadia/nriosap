import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import pg from "pg";
import { applyMigrations, isPublicSetting, makeAdmin, problems, vercelEnv } from "../../scripts/go-live-lib.mjs";
import { shimFile } from "../../scripts/local/pg.mjs";

const url = inject("dbUrl");
const good = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_x",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_y",
  DATABASE_URL: "postgresql://postgres.abc:pw1@aws-0.pooler.supabase.com:6543/postgres",
  ADMIN_EMAIL: "you@example.test",
  APP_ENCRYPTION_KEY: "k".repeat(44),
};
let admin: pg.Client;
let fresh: pg.Client;

beforeAll(async () => {
  admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query("drop database if exists golive");
  await admin.query("create database golive");
  fresh = new pg.Client({ connectionString: url.replace(/\/postgres$/, "/golive") });
  await fresh.connect();
  await fresh.query(readFileSync(shimFile, "utf8"));
});

afterAll(async () => {
  await fresh.end();
  await admin.query("drop database if exists golive");
  await admin.end();
});

describe("go-live database steps", () => {
  it("applies every migration to an empty database", async () => {
    const applied = await applyMigrations(fresh);
    expect(applied[0]).toBe("001_init.sql");
    expect(applied.at(-1)).toBe("013_payments_and_plan_copy.sql");
    expect(applied).toHaveLength(13);
  });

  it("does nothing the second time", async () => {
    expect(await applyMigrations(fresh)).toEqual([]);
  });

  it("keeps the tracking table away from signed-in users", async () => {
    const { rows } = await fresh.query("select relrowsecurity from pg_class where relname = '_ally_migrations'");
    expect(rows[0].relrowsecurity).toBe(true);
  });

  it("rolls back a broken migration and names it", async () => {
    const dir = path.join(import.meta.dirname, "fixtures-bad");
    await expect(applyMigrations(fresh, dir)).rejects.toThrow(/900_bad\.sql failed/);
    expect((await fresh.query("select to_regclass('public.half_done') as t")).rows[0].t).toBeNull();
  });

  it("makes an existing person an admin, and reports when there is nobody", async () => {
    const id = "abababab-0000-4000-8000-000000000001";
    await fresh.query("insert into auth.users(id, email) values ($1, 'you@example.test')", [id]);
    expect(await makeAdmin(fresh, id, "You@Example.test")).toBe(true);
    expect((await fresh.query("select role, email from profiles where id = $1", [id])).rows[0]).toEqual({ role: "admin", email: "you@example.test" });
    expect(await makeAdmin(fresh, "abababab-0000-4000-8000-000000000002", "x@example.test")).toBe(false);
  });
});

describe("go-live settings check", () => {
  it("accepts a complete set", () => {
    expect(problems(good)).toEqual([]);
  });
  it("names what is missing and never repeats a value", () => {
    const out = problems({ ...good, DATABASE_URL: "postgresql://postgres:[YOUR-PASSWORD]@x.pooler.supabase.com:6543/postgres", SUPABASE_SERVICE_ROLE_KEY: "" });
    expect(out.join()).toContain("placeholder");
    expect(out.join()).toContain("SUPABASE_SERVICE_ROLE_KEY is empty");
  });
  it("refuses a secret key in the public slot", () => {
    expect(problems({ ...good, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_z" }).join()).toContain("exposed in the browser");
  });
  it("refuses the wrong database port", () => {
    expect(problems({ ...good, DATABASE_URL: "postgresql://u:p@db.abc.supabase.co:5432/postgres" }).join()).toContain("6543");
  });
  it("does a bad address without crashing", () => {
    expect(problems({ ...good, DATABASE_URL: "not a url" }).join()).toContain("not a valid address");
  });
});

describe("what goes to Vercel", () => {
  const sent = vercelEnv({ ...good, DEMO_MODE: "1", SEED_STAFF_PASSWORD: "x" }, "https://site.example");
  it("turns on Google, and keeps WhatsApp sending and email links off", () => {
    expect(sent).toMatchObject({ GOOGLE_SIGNIN: "1", EMAIL_SIGNIN: "0", WHATSAPP_SEND_ENABLED: "0", PG_POOL_MAX: "1", APP_URL: "https://site.example" });
  });
  it("never sends demo settings or the admin email", () => {
    for (const k of ["DEMO_MODE", "SEED_STAFF_PASSWORD", "ADMIN_EMAIL"]) expect(sent).not.toHaveProperty(k);
  });
  it("marks secrets as sensitive", () => {
    for (const k of ["SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "APP_ENCRYPTION_KEY"]) expect(isPublicSetting(k)).toBe(false);
    expect(isPublicSetting("NEXT_PUBLIC_SUPABASE_URL")).toBe(true);
  });
});
