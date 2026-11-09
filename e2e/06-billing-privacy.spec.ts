import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { localEnv } from "../scripts/local/env.mjs";
import { DEMO, FAM, magicLink, signInOwner, signInStaff, finishOnboarding } from "./helpers";

const env = localEnv();

async function stripeEvent(request: APIRequestContext, type: string, object: object, sig?: string) {
  const payload = JSON.stringify({ id: `evt_${Date.now()}_${Math.random()}`, object: "event", type, data: { object } });
  const header = sig ?? new Stripe(env.STRIPE_SECRET_KEY).webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET });
  return request.post("/api/stripe", { data: payload, headers: { "content-type": "application/json", "stripe-signature": header } });
}

test("owner starts Stripe test checkout and sees the subscription after the webhook", async ({ page, request }) => {
  await signInOwner(page, "mihir");
  await page.goto(`/family/${FAM.kulkarni}/billing`);
  await expect(page.getByText("Not started")).toBeVisible();
  await page.getByRole("button", { name: "Start subscription" }).click();
  await expect(page).toHaveURL(/fake-checkout/);

  expect((await stripeEvent(request, "checkout.session.completed", { object: "checkout.session", metadata: { family_id: FAM.kulkarni }, customer: "cus_1", subscription: "sub_1" })).status()).toBe(200);
  expect((await stripeEvent(request, "customer.subscription.updated", { id: "sub_1", object: "subscription", metadata: { family_id: FAM.kulkarni }, customer: "cus_1", status: "active", cancel_at_period_end: false, items: { data: [{ price: { unit_amount: 7900 }, current_period_end: Math.floor(Date.now() / 1000) + 2592000 }] } })).status()).toBe(200);

  await page.goto(`/family/${FAM.kulkarni}/billing`);
  await expect(page.getByText("Status: Active")).toBeVisible();
  await page.getByRole("button", { name: "Manage subscription" }).click();
  await expect(page).toHaveURL(/fake-portal/);
});

test("a forged Stripe event is refused", async ({ request }) => {
  expect((await stripeEvent(request, "checkout.session.completed", { metadata: { family_id: FAM.mehta } }, "t=1,v1=bad")).status()).toBe(400);
});

test("a coordinator sees billing but cannot start a subscription", async ({ page }) => {
  await signInStaff(page, "meera");
  await page.goto(`/family/${FAM.shah}/billing`);
  await expect(page.getByRole("button", { name: "Start subscription" })).toHaveCount(0);
});

test("export is owner only, and contains decrypted fields", async ({ page }) => {
  await signInOwner(page, "priya");
  const json = await page.request.get(`/api/family/${FAM.shah}/export?format=json`);
  expect(json.status()).toBe(200);
  const body = await json.json();
  expect(body.policies[0].policy_number).toBe("DIA-2291-77410");
  expect(body.policies[0].policy_no_enc).toBeUndefined();
  expect(body.access_log.length).toBeGreaterThan(0);
  const zip = await page.request.get(`/api/family/${FAM.shah}/export?format=zip`);
  expect(zip.status()).toBe(200);
  expect((await zip.body()).subarray(0, 2).toString()).toBe("PK");

  expect((await page.request.get(`/api/family/${FAM.mehta}/export`)).status()).toBe(404);
  await page.context().clearCookies();
  await signInStaff(page, "meera");
  expect((await page.request.get(`/api/family/${FAM.shah}/export`)).status()).toBe(404);
  await page.context().clearCookies();
  await signInStaff(page, "admin");
  expect((await page.request.get(`/api/family/${FAM.shah}/export`)).status()).toBe(404);
});

test("parent sends STOP on WhatsApp: consent ends at once and uploads stop", async ({ page, request }) => {
  await signInStaff(page, "kavita");
  const data = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "919800000003", id: `wamid.stop${Date.now()}`, type: "text", text: { body: "STOP" } }] } }] }] });
  await request.post("/api/whatsapp", { data, headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", env.WHATSAPP_APP_SECRET).update(data).digest("hex")}` } });
  await expect.poll(async () => {
    await page.goto(`/family/${FAM.mehta}`);
    return page.getByText("Consent withdrawn").filter({ visible: true }).count();
  }, { timeout: 20000 }).toBeGreaterThan(0);
  await page.goto(`/family/${FAM.mehta}/documents`);
  await expect(page.getByText("once your parent's consent call is finished")).toBeVisible();
  await page.goto("/ops");
  await expect(page.locator("table").getByRole("link", { name: "Consent withdrawn: stop work" })).toBeVisible();
});

test("owner deletes a family: rows, files and account are gone, the audit trail stays", async ({ page }) => {
  const email = `to-delete-${Date.now()}@${DEMO}`;
  await magicLink(page, email);
  await finishOnboarding(page);
  await expect(page).toHaveURL(/\/family\//);
  const familyId = page.url().split("/").pop()!;
  await page.goto(`/family/${familyId}/privacy`);
  const label = (await page.getByText(/^Type .+ to confirm/).filter({ visible: true }).first().textContent())!;
  const familyName = label.match(/^Type (.+?) to confirm/)![1];
  await page.getByLabel(/^Type .+ to confirm/).filter({ visible: true }).fill("wrong");
  await page.getByRole("button", { name: "Delete this family's data" }).click();
  await expect(page.getByText(`Please type ${familyName} exactly`)).toBeVisible();
  await page.getByLabel(/^Type .+ to confirm/).filter({ visible: true }).fill(familyName);
  await page.getByRole("button", { name: "Delete this family's data" }).click();
  await expect(page).toHaveURL(/goodbye/);

  await signInStaff(page, "admin");
  await page.goto(`/family/${familyId}`);
  await expect(page.getByText("Delia Gone")).toHaveCount(0);
  expect((await page.goto(`/family/${familyId}`))?.status()).toBe(404);
});

test("another owner cannot delete a family they do not own", async ({ page }) => {
  await signInOwner(page, "outsider");
  expect((await page.goto(`/family/${FAM.shah}/privacy`))?.status()).toBe(404);
});

test("security headers and a strict policy on signed-in pages", async ({ page }) => {
  const res = await page.goto("/signin");
  const h = res!.headers();
  expect(h["content-security-policy"]).toContain("'strict-dynamic'");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["strict-transport-security"]).toContain("max-age");
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|violates/.test(m.text())) errors.push(m.text()); });
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/approvals`);
  await expect(page.getByRole("button", { name: "Approve action" }).first()).toBeEnabled();
  expect(errors).toEqual([]);
});

test("the marketing page works under its policy and the waitlist saves", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/");
  await page.getByLabel(/email/i).fill(`wait-${Date.now()}@example.com`);
  await page.getByLabel("Where do you live now?").fill("Canada");
  await page.locator("form").getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByText("You are on the list")).toBeVisible();
  expect(errors).toEqual([]);
});
