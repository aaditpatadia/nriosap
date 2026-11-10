import { expect, test, type Browser, type Page } from "@playwright/test";
import { DEMO, FAM, finishOnboarding, magicLink, signInOwner, signInStaff } from "./helpers";

const v = (p: Page, text: string | RegExp) => p.getByText(text).filter({ visible: true });
const staffPage = async (browser: Browser, who: "admin" | "meera" = "admin") => {
  const p = await browser.newPage({ baseURL: "http://localhost:3100" });
  await signInStaff(p, who);
  return p;
};

test("a new customer goes from sign-in to a finished, approved, proven request", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await magicLink(page, `journey-${Date.now()}@${DEMO}`);
  await expect(page).toHaveURL(/\/onboarding/);
  await finishOnboarding(page);
  await expect(page).toHaveURL(/\/family\//);
  await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ }).filter({ visible: true })).toBeVisible();
  await expect(v(page, "Your home page fills up with your real requests, documents and dates.")).toBeVisible();
  await expect(v(page, "Nothing needs you right now.")).toBeVisible();

  await page.getByRole("link", { name: "New request" }).filter({ visible: true }).first().click();
  await page.getByLabel("What do you need handled in India?").filter({ visible: true }).fill("I need someone to inspect my flat in Pune. The tenant says there's a leakage problem.");
  await expect(v(page, "Please check this")).toBeVisible();
  await expect(page.getByLabel("Where in India")).toHaveValue("Pune");
  await page.getByRole("button", { name: "Send to my coordinator" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await expect(v(page, "Submitted").first()).toBeVisible();
  const ref = (await page.getByText(/ALY-\d+/).filter({ visible: true }).first().textContent())!.match(/ALY-\d+/)![0];

  const desk = await staffPage(browser);
  await desk.goto("/ops/requests");
  await desk.getByRole("link", { name: new RegExp(ref) }).filter({ visible: true }).click();
  await desk.getByLabel("Provider fee (Rs)").filter({ visible: true }).fill("1000");
  await desk.getByLabel("Ally fee (Rs)").filter({ visible: true }).fill("300");
  await desk.getByLabel("Taxes (Rs)").filter({ visible: true }).fill("54");
  await expect(v(desk, "Total: Rs 1,354")).toBeVisible();
  await desk.getByRole("button", { name: "Send to the customer" }).click();
  await expect(v(desk, "Sent to the customer.")).toBeVisible();

  await page.reload();
  await expect(v(page, "Awaiting Approval").first()).toBeVisible();
  await expect(v(page, "Rs 1,354").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve payment" }).filter({ visible: true }).click();
  await expect(v(page, "Approved").first()).toBeVisible();
  await page.reload();
  await expect(v(page, "Approved, payment not completed")).toBeVisible();

  await desk.reload();
  await desk.getByLabel("What was done, and by whom?").filter({ visible: true }).fill("Our coordinator visited the flat and photographed the leak under the sink.");
  await desk.getByRole("button", { name: "Save report" }).click();
  await expect(v(desk, "Report saved.")).toBeVisible();
  await desk.getByLabel("Move to").filter({ visible: true }).selectOption("completed");
  await desk.getByRole("button", { name: "Update status" }).click();
  await expect(desk.getByRole("status").filter({ hasText: "Status updated." })).toBeVisible();
  await desk.close();

  await page.reload();
  await expect(v(page, "Completed").first()).toBeVisible();
  await expect(v(page, "photographed the leak")).toBeVisible();
});

test("work that cannot be done is refused with a reason", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/requests/new`);
  await page.getByLabel("What do you need handled in India?").filter({ visible: true }).fill("Please bribe the clerk so the file moves faster.");
  await expect(page.getByRole("alert").filter({ hasText: "bribe" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send to my coordinator" })).toBeDisabled();
});

test("asking to send money across borders gets a plain answer", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/requests/new`);
  await page.getByLabel("What do you need handled in India?").filter({ visible: true }).fill("Please transfer money to my father from my US account");
  await expect(page.getByRole("alert").filter({ hasText: "licensed partner" })).toBeVisible();
});

test("the owner can ask for changes to a quotation", async ({ page, browser }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/requests/new`);
  await page.getByLabel("What do you need handled in India?").filter({ visible: true }).fill("Please replace the geyser in the flat in Rajkot by next week.");
  await page.getByRole("button", { name: "Send to my coordinator" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const requestId = page.url().split("/").pop()!;
  const desk = await staffPage(browser, "meera");
  await desk.goto(`/ops/requests/${requestId}`);
  await desk.getByLabel("Provider fee (Rs)").filter({ visible: true }).fill("5000");
  await desk.getByRole("button", { name: "Send to the customer" }).click();
  await expect(v(desk, "Sent to the customer.")).toBeVisible();
  await desk.close();
  await page.reload();
  await page.getByRole("button", { name: "Request changes" }).click();
  await page.getByLabel("What should change?").fill("Please use a smaller model.");
  await page.getByRole("button", { name: "Send to my coordinator" }).click();
  await expect(v(page, "You asked for changes: Please use a smaller model.").first()).toBeVisible();
  await expect(v(page, "Under Review").first()).toBeVisible();
});

test("an invited relative sees only what they were given", async ({ page, browser }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/people`);
  await page.getByLabel("Their name").fill("Rohan Sibling");
  await page.getByLabel("Who are they?").selectOption("sibling");
  await page.getByRole("radio", { name: "Invite them to sign in" }).check();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const link = await page.getByLabel("Invitation link").inputValue();
  expect(link).toContain("/invite/");

  const ctx = await browser.newContext({ baseURL: "http://localhost:3100" });
  const other = await ctx.newPage();
  await magicLink(other, `rohan-${Date.now()}@${DEMO}`);
  await other.goto(new URL(link).pathname);
  await other.getByRole("button", { name: "Accept the invitation" }).click();
  await expect(other).toHaveURL(new RegExp(FAM.shah));
  const nav = other.getByRole("navigation", { name: "Family sections" });
  await expect(nav.getByRole("link", { name: "Requests" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Payments & Approvals" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Family & Details" })).toHaveCount(0);
  await other.goto(`/family/${FAM.shah}/people`);
  await other.waitForLoadState("networkidle");
  await expect(other.getByText("Add someone")).toHaveCount(0);
  expect((await other.request.post("/api/documents", { headers: { origin: "http://localhost:3100" }, multipart: { familyId: FAM.shah } })).status()).toBeGreaterThanOrEqual(400);

  await other.goto(new URL(link).pathname);
  await expect(other.getByRole("heading", { name: "This invitation is no longer valid" })).toBeVisible();
  await ctx.close();
});

test("the vault filters by category and searches what it found", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/documents`);
  await page.getByRole("navigation", { name: "Document categories" }).getByRole("link", { name: /^Insurance/ }).click();
  await expect(page).toHaveURL(/cat=insurance/);
  await page.goto(`/family/${FAM.shah}/documents?q=zzz-not-there`);
  await expect(v(page, "Nothing matches that search.")).toBeVisible();
});

test("properties can be added, and the menu folds", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/properties`);
  const name = `Baroda house ${Date.now()}`;
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(v(page, name)).toBeVisible();
  const label = page.locator(".side-link .side-text").first();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(label).toBeVisible();
  const before = await page.locator("aside.side").evaluate((e) => e.getBoundingClientRect().width);
  await page.getByRole("button", { name: "Fold the menu" }).click();
  await expect.poll(() => page.locator("aside.side").evaluate((e) => e.getBoundingClientRect().width)).toBeLessThan(before);
});

test("the home page explains itself and its preview works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your life is abroad.");
  await expect(page.getByRole("link", { name: "Get started with Ally" })).toHaveAttribute("href", "/signin");
  await page.getByRole("link", { name: "Explore how it works" }).click();
  await expect(page).toHaveURL(/#how$/);
  await page.getByText("Business and Administrative Coordination", { exact: true }).click();
  await expect(v(page, "We do not move money or give financial advice.")).toBeVisible();
  await expect(v(page, "Sample data")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.locator(".chip", { hasText: "Approved" })).toBeVisible();
  await expect(page.getByRole("img", { name: /example connections/ })).toBeVisible();
});

test("no fictional records appear on a new customer's dashboard", async ({ page }) => {
  await magicLink(page, `empty-${Date.now()}@${DEMO}`);
  await finishOnboarding(page);
  await expect(page).toHaveURL(/\/family\//);
  for (const sample of ["Sample data", "Pune flat", "Rs 1,354", "Kusum"]) await expect(page.getByText(sample)).toHaveCount(0);
});
