// Runs a command with the local stack's environment. Usage: node scripts/local/with-env.mjs next build
import { spawnSync } from "node:child_process";
import { localEnv } from "./env.mjs";

const r = spawnSync("npx", process.argv.slice(2), { stdio: "inherit", shell: true, env: { ...process.env, ...localEnv() } });
process.exit(r.status ?? 1);
