import { expect, test } from "@playwright/test";
import { FAM, signInOwner, signInStaff, DEMO } from "./helpers";

const EVIL = { origin: "https://evil.example" };
const PRIVATE = ["/home", "/onboarding", "/ops", "/ops/families", "/ops/new", "/ops/onboard", `/ops/consent/${FAM.shah}`, `/ops/messages/${FAM.shah}`, `/chat/${FAM.shah}`, `/family/${FAM.shah}`, `/family/${FAM.shah}/claims`, `/family/${FAM.shah}/documents`, `/family/${FAM.shah}/calendar`, `/family/${FAM.shah}/approvals`, `/family/${FAM.shah}/report`, `/family/${FAM.shah}/billing`, `/family/${FAM.shah}/privacy`];

test("every private page sends a signed-out visitor to sign in", async ({ request }) => {
  for (const url of PRIVATE) {
    const r = await request.get(url, { maxRedirects: 0 });
    expect(r.status(), url).toBe(307);
    expect(r.headers().location, url).toContain("/signin");
  }
});

test("a family owner cannot open staff pages or staff downloads", async ({ page }) => {
  await signInOwner(page, "priya");
  for (const url of ["/ops", "/ops/families", "/ops/new", "/ops/onboard"]) {
    await page.goto(url);
    await expect(page, url).not.toHaveURL(/\/ops/);
  }
  expect((await page.request.get("/ops/families/export", { maxRedirects: 0 })).status()).toBe(403);
});

test("session cookies cannot be read by page scripts", async ({ page, context }) => {
  await signInOwner(page, "priya");
  const sessions = (await context.cookies()).filter((c) => c.name.startsWith("sb-"));
  expect(sessions.length).toBeGreaterThan(0);
  for (const c of sessions) {
    expect(c.httpOnly, c.name).toBe(true);
    expect(c.sameSite, c.name).toBe("Lax");
  }
  expect(await page.evaluate(() => document.cookie)).not.toContain("sb-");
});

test("private pages are never cached", async ({ page }) => {
  await signInOwner(page, "priya");
  const r = await page.request.get(`/family/${FAM.shah}`);
  expect(r.headers()["cache-control"]).toContain("no-store");
});

test("files that must stay private are not served", async ({ request }) => {
  for (const url of ["/.env", "/.env.local", "/.env.example", "/.git/config", "/.git/HEAD", "/package.json", "/next.config.ts", "/supabase/migrations/001_init.sql", "/.next/BUILD_ID"]) {
    expect((await request.get(url)).status(), url).toBe(404);
  }
});

test("security headers are on every kind of page", async ({ request }) => {
  for (const url of ["/", "/signin", "/demo", "/privacy", `/ops`]) {
    const h = (await request.get(url, { maxRedirects: 0 })).headers();
    expect(h["strict-transport-security"], url).toContain("max-age=63072000");
    expect(h["x-content-type-options"], url).toBe("nosniff");
    expect(h["x-frame-options"], url).toBe("DENY");
    expect(h["referrer-policy"], url).toBeTruthy();
    expect(h["permissions-policy"], url).toContain("camera=()");
    expect(h["cross-origin-opener-policy"], url).toBe("same-origin");
    expect(h["content-security-policy"], url).toContain("frame-ancestors 'none'");
    expect(h["x-powered-by"], url).toBeUndefined();
  }
});

test("other sites cannot call the API", async ({ request }) => {
  const preflight = await request.fetch("/api/documents", { method: "OPTIONS", headers: { ...EVIL, "access-control-request-method": "POST" } });
  expect(preflight.status()).toBe(403);
  expect(preflight.headers()["access-control-allow-origin"]).toBeUndefined();
  for (const url of ["/api/waitlist", "/api/documents"]) {
    const r = await request.post(url, { headers: EVIL, data: {} });
    expect(r.status(), url).toBe(403);
    expect(r.headers()["access-control-allow-origin"], url).toBeUndefined();
  }
  const get = await request.get(`/api/family/${FAM.shah}/export`, { headers: EVIL });
  expect(get.headers()["access-control-allow-origin"]).toBeUndefined();
});

test("a form replayed from another site is refused", async ({ page, request }) => {
  await page.goto("/signin");
  const sent = page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
  await page.getByLabel("Your email").fill(`priya@${DEMO}`);
  await page.getByRole("button", { name: "Email me a link" }).click();
  const original = await sent;
  const replay = await request.post("/signin", {
    headers: { ...EVIL, "next-action": original.headers()["next-action"] },
    multipart: { "1_email": "priya@example.test", "1_next": "/home", "0": '[null,"$K1"]' },
  });
  expect(replay.status()).toBeGreaterThanOrEqual(400);
});

test("wrong passwords are refused, and repeats alert an admin", async ({ page, browser }) => {
  await page.goto("/signin");
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Work email").fill(`meera@${DEMO}`);
    await page.getByLabel("Password").fill(`wrong-password-${i}`);
    await page.getByRole("button", { name: "Sign in to the desk" }).click();
    await expect(page.getByText("That email and password did not match.")).toBeVisible();
    await page.reload();
  }
  await expect(page).toHaveURL(/signin/);
  const admin = await browser.newPage({ baseURL: "http://localhost:3100" });
  await signInStaff(admin, "admin");
  await admin.goto("/ops");
  await expect(admin.getByText(/failed sign-ins in 10 minutes from one account/).filter({ visible: true })).toBeVisible();
  await admin.close();
});

test("text a person types is shown as text and never runs", async ({ page }) => {
  await signInStaff(page, "meera");
  await page.goto("/ops");
  const task = await page.locator("table").getByRole("link").first().getAttribute("href");
  await page.goto(task!);
  const payload = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>`;
  await page.getByLabel("Note for the desk").filter({ visible: true }).fill(payload);
  await page.getByRole("button", { name: "Save note" }).filter({ visible: true }).click();
  await expect(page.getByText("Note saved.").filter({ visible: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(payload).filter({ visible: true }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test("uploads refuse the wrong type and an oversized file", async ({ page }) => {
  await signInOwner(page, "priya");
  const origin = { origin: "http://localhost:3100" };
  const post = (name: string, mimeType: string, buffer: Buffer) => page.request.post("/api/documents", { headers: origin, multipart: { familyId: FAM.shah, purpose: "store", file: { name, mimeType, buffer } } });
  const html = await post("bill.pdf", "application/pdf", Buffer.from("<html><script>alert(1)</script></html>"));
  expect(html.status()).toBeGreaterThanOrEqual(400);
  expect((await post("big.pdf", "application/pdf", Buffer.alloc(5 * 1024 * 1024, 1))).status()).toBe(413);
});
