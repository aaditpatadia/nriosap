// Starts a real Postgres from the embedded-postgres npm package. For tests and local runs only.
import EmbeddedPostgres from "embedded-postgres";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import pg from "pg";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");

export function connectionString(port, db = "postgres") {
  return `postgres://postgres:localdev@127.0.0.1:${port}/${db}`;
}

/** Stops a server left behind by an earlier run of this project, using its own data directory only. */
export function stopLeftover(dir) {
  if (!existsSync(path.join(dir, "postmaster.pid"))) return;
  const platform = process.platform === "win32" ? "windows-x64" : `${process.platform}-${process.arch}`;
  const exe = path.join(ROOT, "node_modules", "@embedded-postgres", platform, "native", "bin", process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");
  spawnSync(exe, ["-D", dir, "-m", "fast", "-w", "stop"], { stdio: "ignore" });
}

/** Boots Postgres in .local/<name>. Pass fresh to wipe it first. */
export async function startPostgres({ name = "pg", port = 54329, fresh = false } = {}) {
  const dir = path.join(ROOT, ".local", name);
  stopLeftover(dir);
  if (fresh && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(ROOT, ".local"), { recursive: true });
  const needsInit = !existsSync(path.join(dir, "PG_VERSION"));
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "localdev",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: () => {},
  });
  if (needsInit) await server.initialise();
  await server.start();
  return { server, url: connectionString(port), port };
}

export function migrationFiles() {
  const dir = path.join(ROOT, "supabase", "migrations");
  return readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(dir, f));
}

export async function applySql(url, files) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const f of files) await client.query(readFileSync(f, "utf8"));
  } finally {
    await client.end();
  }
}

export const shimFile = path.join(ROOT, "supabase", "local", "000_supabase_shim.sql");

/** Applies the shim and every migration, tracking what ran so repeat starts are safe. */
export async function migrate(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync(shimFile, "utf8"));
    await client.query("create table if not exists public._local_migrations (name text primary key)");
    await client.query("alter table public._local_migrations enable row level security");
    const done = new Set((await client.query("select name from public._local_migrations")).rows.map((r) => r.name));
    const applied = [];
    for (const f of migrationFiles()) {
      const name = path.basename(f);
      if (done.has(name)) continue;
      await client.query("begin");
      try {
        await client.query(readFileSync(f, "utf8"));
        await client.query("insert into public._local_migrations values ($1)", [name]);
        await client.query("commit");
        applied.push(name);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`Migration ${name} failed: ${e.message}`);
      }
    }
    return applied;
  } finally {
    await client.end();
  }
}
