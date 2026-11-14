// The parts of going live that can be tested without touching a real account.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "ADMIN_EMAIL"];

// Sent to Vercel when they are filled in. Anything not listed here, such as ADMIN_EMAIL, stays on this computer.
const OPTIONAL = ["DATABASE_CA_CERT", "ANTHROPIC_API_KEY", "VIRUS_SCAN_URL", "SARVAM_API_KEY", "INNGEST_SIGNING_KEY", "INNGEST_EVENT_KEY", "SENTRY_DSN", "NEXT_PUBLIC_DESK_WHATSAPP", "NEXT_PUBLIC_SUPPORT_EMAIL", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_CATEGORISER_MODEL"];

/** With WhatsApp sending switched on, every one of these must be set. Values are never printed. */
export const WHATSAPP_REQUIRED = ["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"];

export function whatsappProblems(env) {
  const on = env.WHATSAPP_SENDING === "1" || env.WHATSAPP_SEND_ENABLED === "1";
  if (!on) return [];
  const out = WHATSAPP_REQUIRED.filter((k) => !env[k]?.trim()).map((k) => `WHATSAPP_SENDING is 1 but ${k} is empty.`);
  if (env.WHATSAPP_APP_SECRET && env.WHATSAPP_APP_SECRET === env.WHATSAPP_VERIFY_TOKEN) out.push("WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN are the same. The app secret comes from the Meta app settings; the verify token is one you make up.");
  return out;
}

/** Returns a plain-words problem for each setting that is missing or still a placeholder. Never includes a value. */
export function problems(env) {
  const out = REQUIRED.filter((k) => !env[k]?.trim()).map((k) => `${k} is empty.`);
  try {
    if (env.NEXT_PUBLIC_SUPABASE_URL && !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL)) out.push("NEXT_PUBLIC_SUPABASE_URL should look like https://xxxx.supabase.co");
    if (env.DATABASE_URL) {
      if (/\[.*password.*\]/i.test(env.DATABASE_URL)) out.push("DATABASE_URL still has the [YOUR-PASSWORD] placeholder. Put your database password there.");
      else {
        const u = new URL(env.DATABASE_URL);
        if (!/^postgres(ql)?:$/.test(u.protocol)) out.push("DATABASE_URL should start with postgresql://");
        if (["127.0.0.1", "localhost"].includes(u.hostname)) out.push("DATABASE_URL points at this computer, not Supabase.");
        if (u.port !== "6543") out.push("DATABASE_URL should be the Transaction pooler address, which uses port 6543.");
      }
    }
  } catch {
    out.push("DATABASE_URL is not a valid address. If your password has symbols such as @ or #, reset it to letters and numbers only.");
  }
  if (env.ADMIN_EMAIL && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.ADMIN_EMAIL)) out.push("ADMIN_EMAIL is not a valid email address.");
  if (env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY === env.NEXT_PUBLIC_SUPABASE_ANON_KEY) out.push("The two Supabase keys are the same. SUPABASE_SERVICE_ROLE_KEY must be the secret one.");
  if (env.SUPABASE_SERVICE_ROLE_KEY?.startsWith("sb_publishable_")) out.push("SUPABASE_SERVICE_ROLE_KEY is the publishable key. Use the secret one.");
  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.startsWith("sb_secret_")) out.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is a secret key and would be exposed in the browser. Use the publishable one.");
  out.push(...whatsappProblems(env));
  return out;
}

/** What Vercel should hold in production. Debug and demo settings are never included. */
export function vercelEnv(env, appUrl) {
  const out = {
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ""),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: env.DATABASE_URL,
    APP_ENCRYPTION_KEY: env.APP_ENCRYPTION_KEY,
    APP_URL: appUrl,
    PG_POOL_MAX: "1",
    GOOGLE_SIGNIN: "1",
    EMAIL_SIGNIN: env.EMAIL_SIGNIN ?? "0",
    WHATSAPP_SEND_ENABLED: "0",
    // Sending stays off on go-live. Turn it on by hand in Vercel after Meta verification and template approval.
    WHATSAPP_SENDING: "0",
  };
  for (const k of OPTIONAL) if (env[k]?.trim()) out[k] = env[k].trim();
  return out;
}

export const isPublicSetting = (name) => name.startsWith("NEXT_PUBLIC_") || ["APP_URL", "PG_POOL_MAX", "GOOGLE_SIGNIN", "EMAIL_SIGNIN", "WHATSAPP_SEND_ENABLED", "WHATSAPP_SENDING"].includes(name);

/** Applies each migration once, in order, each in its own transaction. Safe to run again after a failure. */
export async function applyMigrations(client, dir = path.join(import.meta.dirname, "..", "supabase", "migrations")) {
  await client.query("create table if not exists public._ally_migrations (name text primary key, applied_at timestamptz not null default now())");
  await client.query("alter table public._ally_migrations enable row level security");
  const done = new Set((await client.query("select name from public._ally_migrations")).rows.map((r) => r.name));
  const applied = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    await client.query("begin");
    try {
      await client.query(readFileSync(path.join(dir, name), "utf8"));
      await client.query("insert into public._ally_migrations(name) values ($1)", [name]);
      await client.query("commit");
      applied.push(name);
    } catch (e) {
      await client.query("rollback");
      throw new Error(`Migration ${name} failed: ${e.message}`);
    }
  }
  return applied;
}

/** Makes a profile the desk admin. Returns false when the sign-up trigger has not created the profile. */
export async function makeAdmin(client, userId, email) {
  const r = await client.query("update public.profiles set role = 'admin', email = $2 where id = $1", [userId, email.toLowerCase()]);
  return r.rowCount === 1;
}
