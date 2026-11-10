import { expect, test, type Page } from "@playwright/test";
import { DEMO, FAM, finishOnboarding, magicLink, signInOwner, signInStaff } from "./helpers";

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
  await expect(page.getByText("Your working hours").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Plans and entitlements")).toHaveCount(0);
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
  await expect(page.getByRole("navigation", { name: "Family sections" }).getByRole("link", { name: "Family & Details" })).toBeInViewport();
});

test("the website tells the new story and shows the corrected plans", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your life is abroad.");
  await expect(v(page, "Up to 3 new requests a month")).toBeVisible();
  await expect(page.getByText(/no visit caps/i)).toHaveCount(0);
  await expect(v(page, "Illustrative routes only.", ).first()).toBeVisible();
});

test("five places in the customer menu, and the rest is still one click away", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}`);
  const nav = page.getByRole("navigation", { name: "Family sections" });
  await expect(nav.getByRole("link")).toHaveText(["Home", /Requests/, "Documents", "Family & Details", "Settings"]);
  await page.goto(`/family/${FAM.shah}/details`);
  await expect(page.getByRole("heading", { level: 1, name: "Family & Details" })).toBeVisible();
  for (const path of ["/bills", "/properties", "/approvals", "/ask", "/report", "/calendar"]) {
    const res = await page.goto(`/family/${FAM.shah}${path}`);
    expect(res?.status(), path).toBeLessThan(400);
  }
});

test("a payment shows as confirmed only with proof", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/requests/new`);
  await page.getByLabel("What do you need handled in India?").filter({ visible: true }).fill("Please fix the leaking tap in the flat in Rajkot by next week.");
  await page.getByRole("button", { name: "Send to my coordinator" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const requestId = page.url().split("/").pop()!;
  const desk = await (await browser.newContext()).newPage();
  await signInStaff(desk, "meera");
  await desk.goto(`/ops/requests/${requestId}`);
  await desk.getByLabel("Provider fee (Rs)").filter({ visible: true }).fill("800");
  await desk.getByRole("button", { name: "Send to the customer" }).click();
  await expect(v(desk, "Sent to the customer.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Approve payment" }).filter({ visible: true }).click();
  await expect(v(page, "Approved").first()).toBeVisible();
  await desk.reload();
  await desk.getByLabel("Payment link (https only)").filter({ visible: true }).fill("http://not-secure.example/pay");
  await desk.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(v(desk, "The link must start with https://.")).toBeVisible();
  await desk.getByLabel("Payment link (https only)").filter({ visible: true }).fill("https://pay.example.test/plumber");
  await desk.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(v(desk, "Saved. The customer can see it now.")).toBeVisible();
  await page.reload();
  await expect(v(page, "Payment pending")).toBeVisible();
  await expect(page.getByRole("link", { name: /Pay .* directly/ }).filter({ visible: true })).toHaveAttribute("href", "https://pay.example.test/plumber");
  await desk.reload();
  await desk.getByRole("button", { name: "Mark confirmed" }).click();
  await expect(v(desk, "Add the payment reference or the receipt first.")).toBeVisible();
  await desk.getByLabel("Payment reference").fill("UTR123456");
  await desk.getByRole("button", { name: "Mark confirmed" }).click();
  await page.reload();
  await expect(page.getByText("Payment confirmed", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(v(page, "reference UTR123456")).toBeVisible();
});

test("a refresh after sign-up goes back to the account, not to a second sign-up", async ({ page }) => {
  await magicLink(page, `refresh-${Date.now()}@${DEMO}`);
  await finishOnboarding(page);
  await expect(page).toHaveURL(/\/family\//);
  const home = page.url();
  await page.goto("/onboarding");
  await expect(page).toHaveURL(home);
});
