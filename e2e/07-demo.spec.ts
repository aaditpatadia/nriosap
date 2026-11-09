import { expect, test } from "@playwright/test";

test("a visitor runs the bill from photo to done with no account", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/demo");
  await page.getByRole("button", { name: "Check and confirm as Meera" }).click({ timeout: 15_000 });
  await expect(page.getByText("Checked by Meera")).toBeVisible();
  await page.getByRole("button", { name: "Approve payment" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Approve payment" }).click();
  await expect(page.getByText("Receipt saved. Kusum has been told.")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("bhar diya gaya hai")).toHaveCount(1);
  await expect(page.getByText("2h 28m")).toBeVisible();
});

test("not now pays nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/demo");
  await page.getByRole("button", { name: "Check and confirm as Meera" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "Not now" }).click({ timeout: 15_000 });
  await expect(page.getByRole("status")).toContainText("Nothing was paid");
});

test("the demo refuses advice and honours stop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/demo");
  await page.getByRole("button", { name: "Dawai band kar doon?" }).click();
  await expect(page.getByText("We cannot answer that.")).toBeVisible();
  await page.getByRole("button", { name: "STOP", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("everything has stopped");
  await expect(page.getByLabel("Type a message as Kusum")).toBeDisabled();
});

test("on a phone the tabs move to whoever must act", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "Check and confirm as Meera" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Check and confirm as Meera" }).click();
  await expect(page.getByRole("button", { name: "Approve payment" })).toBeVisible({ timeout: 15_000 });
});

test("the page has no server traffic while it runs", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/demo");
  await page.waitForLoadState("networkidle");
  const posts: string[] = [];
  page.on("request", (r) => { if (r.method() !== "GET") posts.push(r.url()); });
  await page.getByLabel("Type a message as Kusum").fill("Please book a lab visit");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("New task added")).toBeVisible();
  expect(posts).toEqual([]);
});

test("pages fill the width on a large screen", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1200 });
  for (const url of ["/", "/demo", "/trust", "/signin"]) {
    await page.goto(url);
    const width = await page.locator("main").first().evaluate((e) => {
      const kids = [...e.querySelectorAll("h1, .card")].map((x) => x.getBoundingClientRect());
      return Math.max(...kids.map((r) => r.right)) - Math.min(...kids.map((r) => r.left));
    });
    expect(width, url).toBeGreaterThan(2200);
  }
});
