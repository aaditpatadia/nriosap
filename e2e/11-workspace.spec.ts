import { expect, test, type Page } from "@playwright/test";
import { FAM, signInOwner, signInStaff } from "./helpers";

const v = (p: Page, text: string | RegExp) => p.getByText(text).filter({ visible: true });

test("a customer adds a bill and it reaches the Overview", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/bills`);
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Name", { exact: true }).fill("Society dues E2E");
  await page.getByRole("textbox", { name: "Due date" }).fill(soon);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added to your calendar." })).toBeVisible();
  await expect(v(page, "Society dues E2E").first()).toBeVisible();
  await page.goto(`/family/${FAM.shah}`);
  await expect(v(page, "Society dues E2E").first()).toBeVisible();
  await page.goto(`/family/${FAM.shah}/bills`);
  await page.getByRole("button", { name: "Mark Society dues E2E as handled" }).click();
  await expect(page.getByRole("button", { name: "Mark Society dues E2E as handled" })).toHaveCount(0);
});

test("a customer adds a property and opens its own page", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/properties`);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Pune flat E2E");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("link", { name: /Pune flat E2E/ }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Pune flat E2E" })).toBeVisible();
  await expect(v(page, "Visits and inspection reports")).toBeVisible();
});

test("Ally Assistant answers from records and refuses to act", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/ask`);
  await page.getByLabel("Ask Ally").fill("Which bills are due this month?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(v(page, /open item|no open bills/).first()).toBeVisible();
  await page.getByLabel("Ask Ally").fill("Pay the electricity bill for me");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(v(page, "I cannot pay, sign, file or approve anything.")).toBeVisible();
});

test("the monthly report downloads as a PDF", async ({ page }) => {
  await signInOwner(page, "priya");
  const res = await page.request.get(`/family/${FAM.shah}/report/pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("a signed-out request for a report PDF is refused", async ({ page }) => {
  const res = await page.request.get(`/family/${FAM.shah}/report/pdf`, { maxRedirects: 0 });
  expect([302, 307, 401]).toContain(res.status());
});

test("a customer cannot reach the Ops console", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto("/ops/partners");
  await expect(page).not.toHaveURL(/\/ops/);
});

test("a coordinator sees the console but not admin pages", async ({ page }) => {
  await signInStaff(page, "meera");
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Ops" });
  await expect(nav.getByRole("link", { name: "Coordinators" })).toHaveCount(0);
  await page.goto("/ops/settings");
  await expect(page).toHaveURL(/\/ops$/);
});

test("an admin adds a partner who starts unreviewed and cannot skip checks", async ({ page }) => {
  await signInStaff(page, "admin");
  await page.goto("/ops/partners");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("E2E Plumbing");
  await page.getByRole("textbox", { name: "Service", exact: true }).fill("Plumbing");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const card = page.locator("article", { hasText: "E2E Plumbing" });
  await expect(card.getByText("Not reviewed")).toBeVisible();
  await expect(card.getByRole("button", { name: /Approve for use/ })).toHaveCount(0);
  await card.getByRole("button", { name: /I checked their identity/ }).click();
  await expect(card.getByText("Identity checked")).toBeVisible();
});

test("the phone layout has a bottom bar and a drawer", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}`);
  const bar = page.getByRole("navigation", { name: "Main sections" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("navigation", { name: "Family sections" }).getByRole("link", { name: "Bills & Renewals" })).toBeInViewport();
});

test("the website tells the new story and shows the corrected plans", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your life is abroad.");
  await expect(v(page, "Up to 3 new requests a month")).toBeVisible();
  await expect(page.getByText(/no visit caps/i)).toHaveCount(0);
  await expect(v(page, "Illustrative routes only.", ).first()).toBeVisible();
});
