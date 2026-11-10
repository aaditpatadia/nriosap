import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { localEnv } from "../scripts/local/env.mjs";
import { FAM, signInOwner, signInStaff } from "./helpers";

const env = localEnv();
const SAME_SITE = { origin: "http://localhost:3100" };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test("no secret reaches the browser bundle", () => {
  const files = walk(".next/static").filter((f) => /\.(js|css|html|json)$/.test(f));
  expect(files.length).toBeGreaterThan(5);
  const bundle = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const secrets = [env.SUPABASE_SERVICE_ROLE_KEY, env.APP_ENCRYPTION_KEY, env.WHATSAPP_APP_SECRET, env.WHATSAPP_ACCESS_TOKEN, env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET, env.ANTHROPIC_API_KEY, env.DATABASE_URL, env.SEED_STAFF_PASSWORD];
  for (const s of secrets) expect(bundle.includes(s), `secret in bundle: ${s.slice(0, 12)}`).toBe(false);
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "APP_ENCRYPTION_KEY", "WHATSAPP_APP_SECRET", "STRIPE_SECRET_KEY", "ANTHROPIC_API_KEY", "DATABASE_URL"]) expect(bundle.includes(name), name).toBe(false);
  expect(/@anthropic-ai|node_modules\/stripe/.test(bundle), "server SDK in bundle").toBe(false);
});

test("no secret or sensitive field reaches a page's HTML", async ({ page }) => {
  await signInOwner(page, "priya");
  const res = await page.goto(`/family/${FAM.shah}/documents`);
  const html = await res!.text();
  expect(html).not.toContain("DIA-2291-77410");
  expect(html).not.toContain("policy_no_enc");
  expect(html).not.toContain("extracted_enc");
  expect(html).not.toContain(env.APP_ENCRYPTION_KEY);
  expect(html).not.toContain("storage_path");
});

test("server logs hold no health data or personal details after the whole run", () => {
  const log = readFileSync(".local/app.log", "utf8");
  expect(log.length).toBeGreaterThan(0);
  const forbidden = ["SGI-44871", "DIA-2291", "Sample General Insurance", "Kusum", "Priya Shah", "ambulance", "chest pain", "Ramesh Testwala", "Spoke for 10 minutes", "9800000001", "@demo.ally.test", "Discharge summary", "sample-policy.pdf", "એમ્બ્યુલન્સ", env.APP_ENCRYPTION_KEY, env.SUPABASE_SERVICE_ROLE_KEY];
  for (const f of forbidden) expect(log.includes(f), `found in logs: ${f}`).toBe(false);
});

test("error pages reveal nothing", async ({ page }) => {
  await signInOwner(page, "priya");
  for (const bad of ["not-a-uuid", "'; drop table families; --", "00000000-0000-4000-8000-000000000000"]) {
    const res = await page.goto(`/family/${encodeURIComponent(bad)}`);
    expect(res?.status(), bad).toBe(404);
    const body = await res!.text();
    expect(body).not.toMatch(/stack|syntax error|pg_|postgres/i);
  }
});

test("api routes refuse anonymous callers", async ({ request }) => {
  expect((await request.get(`/api/family/${FAM.shah}/export`)).status()).toBe(401);
  expect((await request.get("/api/documents/33333333-0000-4000-8000-000000000001/file")).status()).toBe(401);
  expect((await request.get("/api/messages/33333333-0000-4000-8000-000000000001/voice")).status()).toBe(404);
  // Signed-out visitors are redirected to sign in before the route is reached.
  const csv = await request.get("/ops/families/export", { maxRedirects: 0 });
  expect(csv.status()).toBe(307);
  expect(csv.headers().location).toContain("/signin");
  expect((await request.post("/api/documents", { headers: { origin: "http://localhost:3100" }, multipart: { familyId: FAM.shah } })).status()).toBe(401);
});

test("the job endpoint serves the six scheduled jobs plus the two WhatsApp functions", async ({ request }) => {
  const r = await request.get("/api/inngest");
  expect(r.status()).toBe(200);
  expect((await r.json()).function_count).toBe(8);
});

test("the emulated storage refuses anyone without the service key", async ({ request }) => {
  const r = await request.get(`http://127.0.0.1:54321/storage/v1/object/vault/${FAM.shah}/x.pdf`, { headers: { authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` } });
  expect(r.status()).toBe(403);
});

test("a sign-in redirect cannot point at another site", async ({ page }) => {
  await signInStaff(page, "meera");
  await page.goto("/signin?next=https://evil.example");
  await expect(page).toHaveURL(/localhost:3100/);
  await page.goto("/signin?next=//evil.example");
  await expect(page).toHaveURL(/localhost:3100/);
});

test("waitlist endpoint rejects junk and limits abuse", async ({ request }) => {
  expect((await request.post("/api/waitlist", { headers: SAME_SITE, data: { email: "nope" } })).status()).toBe(400);
  const codes: number[] = [];
  for (let i = 0; i < 14; i++) codes.push((await request.post("/api/waitlist", { headers: SAME_SITE, data: { email: `a${i}@x.co`, country: "UK" } })).status());
  expect(codes).toContain(429);
});

test("sign-in links are single use", async ({ page, browser }) => {
  await page.goto("/signin");
  await page.getByLabel("Your email").fill("priya@demo.ally.test");
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const { link } = (await (await page.request.get("http://127.0.0.1:54321/__inbox?email=priya%40demo.ally.test")).json()) as { link: string };
  await page.goto(link);
  await expect(page).toHaveURL(new RegExp(FAM.shah));
  const other = await browser.newPage();
  await other.goto(link);
  await expect(other).toHaveURL(/signin/);
  await other.close();
});
