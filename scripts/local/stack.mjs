// Starts real Postgres plus the Auth and Storage emulator, applies migrations, seeds the demo family.
// Usage: node scripts/local/stack.mjs [--fresh]
import path from "node:path";
import { EMU_PORT, JWT_SECRET, localEnv, PG_PORT } from "./env.mjs";
import { migrate, ROOT, startPostgres } from "./pg.mjs";
import { startEmulator } from "./supabase-emulator.mjs";
import { seedDemo } from "../seed.mjs";

const fresh = process.argv.includes("--fresh");
const env = localEnv();
Object.assign(process.env, env);

const { server, url } = await startPostgres({ name: "pg", port: PG_PORT, fresh });
console.log("postgres up, migrations applied:", await migrate(url));
const emu = await startEmulator({ port: EMU_PORT, dbUrl: url, jwtSecret: JWT_SECRET, storageDir: path.join(ROOT, ".local", "storage") });
console.log("emulator up at", emu.url);
await seedDemo();
console.log("local stack ready");

async function shutdown() {
  await emu.stop().catch(() => {});
  await server.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
