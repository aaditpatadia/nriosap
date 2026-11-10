import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { post, verifyChallenge } from "../scripts/local/whatsapp-emulator.mjs";
import { envelope, FIXTURES, NUMBERS, text } from "../scripts/local/whatsapp-fixtures.mjs";
import { FAM, signInOwner, signInStaff } from "./helpers";

/** Pages can hold a hidden copy while they stream, so only what is visible counts. */
const vis = (l: Locator) => l.filter({ visible: true });

/** The new WhatsApp pipeline, end to end, through the local emulator that signs bodies like Meta. */

const sendAll = async (bodies: object[]) => {
  for (const b of bodies) expect((await post(b)).status).toBe(200);
};

/** Messages are read in the background, so the inbox is reloaded until the conversation shows up. */
async function openConversation(page: Page, name: RegExp | string) {
  await expect.poll(async () => {
    await page.goto("/ops/whatsapp?status=all");
    return vis(page.getByTestId("wa-conversation")).filter({ hasText: name }).count();
  }, { timeout: 30_000 }).toBeGreaterThan(0);
  await vis(page.getByTestId("wa-conversation")).filter({ hasText: name }).first().getByRole("link").click();
  await expect(vis(page.getByRole("list", { name: "Conversation" })).first()).toBeVisible();
}

test("handshake, valid, invalid and missing signatures", async () => {
  expect(await verifyChallenge()).toEqual({ status: 200, text: "emulator-check" });
  expect((await verifyChallenge({ token: "wrong" })).status).toBe(403);
  const body = envelope({ messages: [text(NUMBERS.kusum, "signed wrongly")] });
  expect((await post(body, { signature: "invalid" })).status).toBe(401);
  expect((await post(body, { signature: "missing" })).status).toBe(401);
});

test("a bill photo becomes a request, with the AI reading beside the photo", async ({ page }) => {
  await sendAll(FIXTURES.bill_photo());
  await signInStaff(page, "meera");
  await expect.poll(async () => {
    await page.goto("/ops/whatsapp?status=all");
    return vis(page.getByTestId("wa-conversation")).filter({ hasText: "Kusum Shah" }).filter({ hasText: "Bills and Renewals" }).count();
  }, { timeout: 30_000 }).toBeGreaterThan(0);
  await openConversation(page, "Kusum Shah");
  const msg = vis(page.getByTestId("wa-in")).filter({ hasText: "Electricity bill for the Rajkot house" }).first();
  await expect(msg.getByRole("img", { name: /Photo sent on WhatsApp/ })).toBeVisible();
  await expect(msg.getByRole("link", { name: /^ALY-/ })).toBeVisible();
  const reading = vis(page.getByRole("complementary", { name: "AI reading" })).first();
  await expect(reading).toContainText("Bills and Renewals");
  await expect(reading).toContainText("Prompt version");
  await msg.getByRole("button", { name: "Confirm category" }).click();
  await expect(vis(page.getByText("Category confirmed.")).first()).toBeVisible();
  const a = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a.violations.map((v) => v.id)).toEqual([]);
});

test("the owner sees the request marked via WhatsApp, with the original message", async ({ page }) => {
  await signInStaff(page, "meera");
  await openConversation(page, "Kusum Shah");
  const href = await vis(page.getByTestId("wa-in")).filter({ hasText: "Electricity bill for the Rajkot house" }).first().getByRole("link", { name: /^ALY-/ }).getAttribute("href");
  const requestId = href!.split("/").pop();
  await page.context().clearCookies();
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/requests/${requestId}`);
  await expect(vis(page.getByText("via WhatsApp")).first()).toBeVisible();
  await expect(vis(page.getByRole("heading", { name: "Sent on WhatsApp" })).first()).toBeVisible();
  await expect(vis(page.getByText("Electricity bill for the Rajkot house")).first()).toBeVisible();
});

test("a Marathi emergency goes to the very top of the coordinator's queue", async ({ page }) => {
  await sendAll(FIXTURES.emergency());
  await signInStaff(page, "rohan");
  await expect.poll(async () => {
    await page.goto("/ops/queue");
    return (await page.locator("table tbody tr").first().textContent()) ?? "";
  }, { timeout: 30_000 }).toContain("EMERGENCY: call Sulabha Kulkarni now (WhatsApp)");
  await expect(page.locator("table tbody tr").first()).toContainText("via WhatsApp");
  await page.goto("/ops/whatsapp");
  await expect(vis(page.getByTestId("wa-conversation")).first()).toContainText("Emergency");
});

test("an unknown number reveals nothing, reaches a person, and the reply waits in the outbox", async ({ page }) => {
  await sendAll(FIXTURES.unknown_number());
  await signInStaff(page, "meera");
  await openConversation(page, "Number ending 1234");
  await expect(vis(page.getByText("No family matched")).first()).toBeVisible();
  await expect(vis(page.getByText("WhatsApp sending is off.")).first()).toBeVisible();
  const reply = vis(page.getByTestId("wa-out")).filter({ hasText: "We could not find this number" });
  await expect(reply).toContainText("Would send. Sending is off");
  await expect(reply).not.toContainText(/Shah|Meera|Kusum/);
  const sent = await (await page.request.get("http://127.0.0.1:54322/__whatsapp_sent")).json();
  expect(sent.sent).toEqual([]);
});

test("a repeated delivery is stored once", async ({ page }) => {
  await sendAll(FIXTURES.repeated_delivery());
  await signInStaff(page, "meera");
  await expect.poll(async () => {
    await page.goto("/ops/whatsapp?status=all");
    await vis(page.getByTestId("wa-conversation")).filter({ hasText: "Kusum Shah" }).first().getByRole("link").click();
    return vis(page.getByTestId("wa-in")).filter({ hasText: "This one arrives twice" }).count();
  }, { timeout: 30_000 }).toBe(1);
});

test("a desk reply is checked for advice and waits in the outbox, ready to copy", async ({ page }) => {
  await signInStaff(page, "meera");
  await openConversation(page, "Kusum Shah");
  await vis(page.getByLabel("Message")).fill("You should stop taking the tablets");
  await vis(page.getByRole("button", { name: "Reply", exact: true })).click();
  await expect(vis(page.getByText("reads like medical, legal or tax advice")).first()).toBeVisible();
  await vis(page.getByLabel("Message")).fill("Namaste Kusum ji, Meera here. I have your bill and will look at it today.");
  await vis(page.getByRole("button", { name: "Reply", exact: true })).click();
  await expect(vis(page.getByText("Reply queued.")).first()).toBeVisible();
  await page.goto("/ops/whatsapp/outbox");
  const row = vis(page.getByTestId("wa-outbox")).filter({ hasText: "Meera here. I have your bill" });
  await expect(row).toContainText("Would send");
  await expect(row.getByRole("button", { name: "Copy text" })).toBeVisible();
  const a = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a.violations.map((v) => v.id)).toEqual([]);
});

test("a voice note is kept for a person to hear and never sent to AI", async ({ page }) => {
  await sendAll(FIXTURES.voice_note());
  await signInStaff(page, "meera");
  await expect.poll(async () => {
    await page.goto("/ops/whatsapp?status=all");
    await vis(page.getByTestId("wa-conversation")).filter({ hasText: "Kusum Shah" }).first().getByRole("link").click();
    return vis(page.getByRole("link", { name: "Listen to voice note" })).count();
  }, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(vis(page.getByText("Voice note. Never sent to AI")).first()).toBeVisible();
  const href = await vis(page.getByRole("link", { name: "Listen to voice note" })).first().getAttribute("href");
  expect((await page.request.get(href!, { maxRedirects: 0 })).status()).toBe(303);
});

test("a video is refused politely and STOP blocks any reply", async ({ page }) => {
  await sendAll(FIXTURES.unsupported_video());
  await sendAll(FIXTURES.stop());
  await signInStaff(page, "meera");
  await expect.poll(async () => {
    await page.goto("/ops/whatsapp/outbox");
    return vis(page.getByTestId("wa-outbox")).filter({ hasText: "we can only open photos" }).count();
  }, { timeout: 30_000 }).toBeGreaterThan(0);
  await openConversation(page, "Number ending 1234");
  await expect.poll(async () => {
    await page.reload();
    return vis(page.getByText("Sent STOP. Nothing can be sent.")).count();
  }, { timeout: 30_000 }).toBe(1);
  await expect(vis(page.getByLabel("Message"))).toBeDisabled();
});

test("Reports count WhatsApp messages and checks", async ({ page }) => {
  await signInStaff(page, "admin");
  await page.goto("/ops/reports");
  const m = vis(page.getByTestId("wa-metrics"));
  await expect(m).toContainText("Messages received");
  await expect(m).toContainText("Auto-categorised correctly");
  await expect(m).toContainText("Median time to first human touch");
});

test("a coordinator cannot see or open another family's WhatsApp", async ({ page }) => {
  await signInStaff(page, "meera");
  await openConversation(page, "Kusum Shah");
  const url = page.url();
  await page.context().clearCookies();
  await signInStaff(page, "kavita");
  await page.goto("/ops/whatsapp?status=all");
  await expect(page.getByText("Kusum Shah")).toHaveCount(0);
  await page.goto(url);
  await expect(vis(page.getByText("This page could not be found")).first()).toBeVisible();
  await expect(page.getByText("Electricity bill for the Rajkot house")).toHaveCount(0);
});
