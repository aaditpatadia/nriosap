// Takes the keys in .env.local and makes the live site real: database, storage, your admin account, Vercel settings, redeploy.
// Usage: npm run go-live
// Safe to run again. No key is ever printed or passed on a command line.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { applyMigrations, isPublicSetting, makeAdmin, problems, vercelEnv } from "./go-live-lib.mjs";

const FILE = ".env.local";
const APP_URL = "https://nriosap.vercel.app";
const PROJECT = "nriosap";

const say = (m) => console.log(m);
function stop(m) {
  console.error(`\nStopped: ${m}\nNothing further was changed. Fix it and run this again.`);
  process.exit(1);
}
const vercel = (args, opts = {}) => spawnSync("npx", ["--yes", "vercel@latest", ...args], { shell: true, encoding: "utf8", ...opts });

if (!existsSync(FILE)) stop(`${FILE} was not found.`);
process.loadEnvFile(FILE);
const env = process.env;

const issues = problems(env);
if (issues.length) stop(`\n- ${issues.join("\n- ")}`);

if (!env.APP_ENCRYPTION_KEY) {
  env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  appendFileSync(FILE, `\n# Made by go-live. Keep this safe: losing it makes encrypted data unreadable.\nAPP_ENCRYPTION_KEY=${env.APP_ENCRYPTION_KEY}\n`);
  say("Made an encryption key and saved it in .env.local.");
}

say("\n1 of 5. Setting up the database...");
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: env.DATABASE_CA_CERT ? { ca: Buffer.from(env.DATABASE_CA_CERT, "base64").toString() } : { rejectUnauthorized: false } });
try {
  await db.connect();
} catch (e) {
  stop(`could not reach the database (${e.code ?? e.message}). Check the address and password in DATABASE_URL.`);
}
try {
  const applied = await applyMigrations(db);
  say(applied.length ? `   Applied ${applied.length} migrations.` : "   Already up to date.");

  say("2 of 5. Creating private file storage...");
  const { setupStorage } = await import("./setup-storage.mjs");
  await setupStorage();

  say("3 of 5. Making your account the desk admin...");
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  // No password: you sign in with Google, and Supabase links it to this verified email.
  const made = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: env.ADMIN_NAME ?? "Founder" } });
  let id = made.data.user?.id;
  if (!id) id = (await db.query("select id from auth.users where lower(email) = $1", [email])).rows[0]?.id;
  if (!id) stop(`could not create the account for your admin email (${made.error?.message ?? "unknown"}).`);
  if (!(await makeAdmin(db, id, email))) stop("the account was made but has no profile. Check that all migrations ran.");
  say("   Done.");
} catch (e) {
  stop(e.message);
} finally {
  await db.end().catch(() => {});
}

say("4 of 5. Sending settings to Vercel...");
if (vercel(["whoami"]).status !== 0) {
  say("   A browser will open so you can log in to Vercel.");
  if (vercel(["login"], { stdio: "inherit" }).status !== 0) stop("Vercel login did not finish.");
}
const link = vercel(["link", "--yes", "--project", PROJECT]);
if (link.status !== 0) stop("could not link this folder to the nriosap project on Vercel.");
for (const [name, value] of Object.entries(vercelEnv(env, APP_URL))) {
  // The value goes in over stdin, so it never appears in a process list or shell history.
  const r = vercel(["env", "add", name, "--environment", "production", "--force", "--yes", isPublicSetting(name) ? "--no-sensitive" : "--sensitive"], { input: value });
  if (r.status !== 0) stop(`Vercel refused the setting ${name}.`);
  say(`   ${name}`);
}

say("5 of 5. Redeploying (about a minute)...");
// Vercel builds every push to main, and that route is known to work here.
const commit = spawnSync("git", ["commit", "--allow-empty", "-m", "chore: redeploy with live settings"], { encoding: "utf8" });
if (commit.status !== 0) stop("git could not make the redeploy commit.");
if (spawnSync("git", ["push", "origin", "main"], { stdio: "inherit" }).status !== 0) stop("git could not push. Open Vercel, then Deployments, and press Redeploy instead.");

for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 15_000));
  const html = await fetch(`${APP_URL}/signin`, { cache: "no-store" }).then((r) => r.text()).catch(() => "");
  if (html.includes("Continue with Google")) {
    say(`\nLive. Sign in here: ${APP_URL}/signin`);
    process.exit(0);
  }
}
stop("the site did not show Google sign-in within 10 minutes. Check the latest deployment on Vercel.");
