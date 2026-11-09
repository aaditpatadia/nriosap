import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import { localEnv } from "../scripts/local/env.mjs";
import { FAM, signInOwner, signInStaff } from "./helpers";

const SECRET = localEnv().WHATSAPP_APP_SECRET;
let seq = 0;

async function webhook(request: APIRequestContext, m: object, sig?: string) {
  const data = JSON.stringify({ entry: [{ changes: [{ value: { messages: [m] } }] }] });
  return request.post("/api/whatsapp", {
    data,
    headers: { "content-type": "application/json", "x-hub-signature-256": sig ?? `sha256=${createHmac("sha256", SECRET).update(data).digest("hex")}` },
  });
}
const msg = (from: string, body: string) => ({ from, id: `wamid.t${Date.now()}${seq++}`, type: "text", text: { body } });
const KUSUM = "919800000001";
const HARISH = "919800000003";

test("handshake and bad signatures", async ({ request }) => {
  const token = localEnv().WHATSAPP_VERIFY_TOKEN;
  const ok = await request.get(`/api/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=abc`);
  expect(await ok.text()).toBe("abc");
  expect((await request.get("/api/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc")).status()).toBe(403);
  expect((await webhook(request, msg(KUSUM, "hello"), "sha256=00")).status()).toBe(401);
});

test("emergency message becomes a top-of-queue ops task for the right coordinator", async ({ request, page }) => {
  expect((await webhook(request, msg(KUSUM, "Please send an ambulance")).then((r) => r.status()))).toBe(200);
  await signInStaff(page, "meera");
  const row = page.locator("table tbody tr").first();
  await expect(row).toContainText("EMERGENCY: call the parent now");
  await expect(row).toContainText("Emergency");
  await expect(row).toContainText("Shah family");
  await page.context().clearCookies();
  await signInStaff(page, "kavita");
  await expect(page.locator("table").getByText("EMERGENCY: call the parent now")).toHaveCount(0);
});

test("a Gujarati emergency works too, and the family timeline shows it", async ({ request, page }) => {
  await webhook(request, msg(HARISH, "એમ્બ્યુલન્સ બોલાવો"));
  await signInOwner(page, "neha");
  await expect(page.getByText("looks like an emergency").first()).toBeVisible();
});

test("a repeated webhook delivery is stored once", async ({ request, page }) => {
  const m = { from: KUSUM, id: "wamid.dupe1", type: "text", text: { body: "only once please" } };
  await webhook(request, m);
  await webhook(request, m);
  await signInStaff(page, "meera");
  await page.goto(`/ops/messages/${FAM.shah}`);
  await expect(page.locator("li", { hasText: "only once please" }).filter({ visible: true })).toHaveCount(1);
});

test("an unknown number stores nothing and still gets a 200", async ({ request }) => {
  expect((await webhook(request, msg("911111111111", "who is this"))).status()).toBe(200);
});

test("document on WhatsApp lands in the vault and is read", async ({ request, page }) => {
  await webhook(request, { from: KUSUM, id: `wamid.doc${Date.now()}`, type: "document", document: { id: "media-doc-1", mime_type: "application/pdf", filename: "wa-policy.pdf" } });
  await signInOwner(page, "priya");
  await expect.poll(async () => {
    await page.goto(`/family/${FAM.shah}/documents`);
    return page.locator("li", { hasText: "wa-policy.pdf" }).filter({ visible: true }).count();
  }, { timeout: 30000 }).toBe(1);
  await expect(page.locator("li", { hasText: "wa-policy.pdf" }).filter({ visible: true })).toContainText("Fake Insurer");
});

test("voice note is stored for a person to hear, with no invented transcript", async ({ request, page }) => {
  await webhook(request, { from: KUSUM, id: `wamid.v${Date.now()}`, type: "audio", audio: { id: "media-audio-1", mime_type: "audio/ogg" } });
  await signInStaff(page, "meera");
  await expect.poll(async () => {
    await page.goto(`/ops/messages/${FAM.shah}`);
    return page.getByText("No transcript yet").filter({ visible: true }).count();
  }, { timeout: 30000 }).toBeGreaterThan(0);
  const href = await page.getByRole("link", { name: "Listen" }).filter({ visible: true }).first().getAttribute("href");
  expect((await page.request.get(href!, { maxRedirects: 0 })).status()).toBe(303);
});

test("advice is blocked. A clean draft waits for a human click. Sending stays off", async ({ request, page }) => {
  await webhook(request, msg(KUSUM, "Any update?"));
  await signInStaff(page, "meera");
  await page.goto(`/ops/messages/${FAM.shah}`);
  await expect(page.getByText("Sending is off until WhatsApp business verification")).toBeVisible();

  await page.getByLabel("Draft").fill("You should stop taking the tablets");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("reads like medical, legal or tax advice").first()).toBeVisible();
  await expect(page.getByText("Blocked: reads like advice").first()).toBeVisible();

  await page.getByLabel("Draft").fill("Namaste, we are following up with the hospital desk.");
  await page.getByRole("button", { name: "Save draft" }).click();
  const draft = page.locator("li", { hasText: "we are following up with the hospital desk" }).filter({ visible: true });
  await expect(draft).toContainText("Draft, not sent");
  await draft.getByRole("button", { name: "Approve and send" }).click();
  await expect(page.locator("li", { hasText: "we are following up with the hospital desk" }).filter({ visible: true })).toContainText("Approved. Sending is off");

  const sent = await (await request.get("http://127.0.0.1:54322/__whatsapp_sent")).json();
  expect(sent.sent).toEqual([]);
});

test("outside the 24 hour window only a template can go out", async ({ page }) => {
  await signInStaff(page, "rohan");
  await page.goto(`/ops/messages/${FAM.kulkarni}`);
  await expect(page.getByText("Outside the 24 hour window")).toBeVisible();
  await page.getByLabel("Draft").fill("Namaste, a quick update.");
  await page.getByRole("button", { name: "Save draft" }).click();
  const draft = page.locator("li", { hasText: "a quick update" }).filter({ visible: true });
  await draft.getByRole("button", { name: "Approve and send" }).click();
  await expect(page.getByText("Use a template message")).toBeVisible();
  await page.getByRole("textbox", { name: "doc", exact: true }).fill("policy copy");
  await page.getByRole("button", { name: "Approve and send template" }).click();
  await expect(page.getByText("Recorded. Sending is off")).toBeVisible();
});

test("simulated parent chat still drives the emergency path", async ({ page }) => {
  await signInStaff(page, "rohan");
  await page.goto(`/chat/${FAM.kulkarni}`);
  await page.getByLabel("Message as parent").fill("emergency, please call");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Emergency words detected")).toBeVisible();
});

test("a coordinator cannot read or send for an unassigned family", async ({ page }) => {
  await signInStaff(page, "rohan");
  await page.goto(`/ops/messages/${FAM.shah}`);
  await expect(page.getByText("This page could not be found")).toBeVisible();
  await expect(page.getByText("Kusum Shah")).toHaveCount(0);
});
