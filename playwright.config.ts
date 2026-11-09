import { defineConfig } from "@playwright/test";
import { APP_PORT, localEnv } from "./scripts/local/env.mjs";

const env = { ...process.env, ...localEnv(), NODE_ENV: "production" } as Record<string, string>;
// Tests must only ever use the fake key above, whatever credentials this shell happens to hold.
delete env.ANTHROPIC_AUTH_TOKEN;
delete env.OPENAI_API_KEY;
const reuse = !process.env.CI && process.env.PW_REUSE === "1";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${APP_PORT}`, channel: "chrome", trace: "off", screenshot: "off" },
  webServer: [
    { command: "node scripts/local/stack.mjs --fresh", url: "http://127.0.0.1:54321/auth/v1/health", env, reuseExistingServer: reuse, timeout: 120_000, stdout: "pipe", gracefulShutdown: { signal: "SIGTERM", timeout: 8000 } },
    { command: `npx next start -p ${APP_PORT}`, url: `http://localhost:${APP_PORT}/`, env, reuseExistingServer: reuse, timeout: 120_000 },
  ],
});
