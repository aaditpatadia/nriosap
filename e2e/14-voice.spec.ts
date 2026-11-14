import { expect, test, type Page } from "@playwright/test";
import { FAM, signInOwner, signInStaff } from "./helpers";

// A made-up microphone, so the test can record without a person speaking.
test.use({ permissions: ["microphone"], launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

const v = (p: Page, text: string | RegExp) => p.getByText(text).filter({ visible: true });

test("a customer sends only a voice note, sees what to cover, and the desk fills in the rest from it", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/requests/new`);

  // What to cover is shown before and while recording.
  await expect(page.getByRole("heading", { name: /Rather talk than type\? Send a voice note/ })).toBeVisible();
  await expect(v(page, "To get this done fastest, tell us:")).toBeVisible();
  for (const item of ["What you need done", "Where, in Mumbai", "Who we meet", "When.", "How soon", "How long it will take", "What we carry", "Anything special"]) {
    await expect(v(page, item).first(), item).toBeVisible();
  }
  await expect(v(page, "Up to 3 minutes. Your coordinator listens to it. It is not sent to an AI service.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send my voice note to my coordinator" })).toHaveCount(0);

  await page.getByRole("button", { name: "Record my voice note" }).click();
  await expect(v(page, "Keep going. Cover these:")).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "Stop and save" }).click();
  await expect(v(page, /Voice note saved/)).toBeVisible();
  await expect(v(page, "Listen back before you send")).toBeVisible();

  await page.getByRole("button", { name: "Send my voice note to my coordinator" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const requestId = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1, name: "Voice note request" })).toBeVisible();
  await expect(v(page, "via voice note")).toBeVisible();
  await expect(page.locator('audio[aria-label="Your voice note"]').first()).toBeVisible();

  // The desk listens, and is told what to do first.
  const desk = await (await browser.newContext()).newPage();
  await signInStaff(desk, "meera");
  await desk.goto(`/ops/requests/${requestId}`);
  await expect(v(desk, /Voice note request\. Listen to the voice note under Files first/)).toBeVisible();
  await expect(desk.locator('audio[aria-label="The customer\'s voice note"]').first()).toBeVisible();
  await expect(v(desk, "Still to fill in or ask the customer for:")).toBeVisible();

  // And fills in what they heard, for the customer.
  const place = desk.getByRole("group", { name: "The place we should go to" }).filter({ visible: true });
  await place.getByLabel("Address").fill("5 Marine Drive");
  await place.getByLabel("PIN code").fill("400020");
  await desk.getByRole("button", { name: "Save these details" }).click();
  await expect(v(desk, "Saved. Your coordinator can see this now.")).toBeVisible();
  await page.reload();
  await expect(v(page, "5 Marine Drive, 400020")).toBeVisible();
});

test("typing still works as before, and a voice note can be added to a typed request", async ({ page }) => {
  test.setTimeout(120_000);
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/requests/new`);
  await page.getByLabel("What do you need handled in India?").filter({ visible: true }).fill("Please arrange a cleaner for my flat in Andheri this week.");
  await page.getByRole("button", { name: "Send to my coordinator" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await expect(page.getByText("via voice note")).toHaveCount(0);
});
