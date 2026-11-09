import { expect, test } from "@playwright/test";
import { SAMPLES } from "./fixtures";
import { DEMO, FAM, magicLink, signInOwner, signInStaff } from "./helpers";

test("approve and undo persist across a reload, and only the owner can decide", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/approvals`);
  const card = page.locator("article", { hasText: "Pay November electricity bill" }).filter({ visible: true });
  await card.getByRole("button", { name: "Approve payment" }).click();
  await expect(card.getByText("Approved", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: /Undo/ })).toBeVisible();

  await page.reload();
  const again = page.locator("article", { hasText: "Pay November electricity bill" }).filter({ visible: true });
  await expect(again.getByText("Approved", { exact: true })).toBeVisible();
  await again.getByRole("button", { name: /Undo/ }).click();
  await expect(again.getByRole("button", { name: "Approve payment" })).toBeVisible();

  await page.reload();
  await expect(page.locator("article", { hasText: "Pay November electricity bill" }).filter({ visible: true }).getByRole("button", { name: "Approve payment" })).toBeVisible();

  await page.goto(`/family/${FAM.shah}`);
  await expect(page.getByText("Undone: Pay November electricity bill").first()).toBeVisible();
});

test("a coordinator sees approvals but cannot decide them", async ({ page }) => {
  await signInStaff(page, "meera");
  await page.goto(`/family/${FAM.shah}/approvals`);
  const card = page.locator("article", { hasText: "Pay November electricity bill" }).filter({ visible: true });
  await expect(card).toContainText("Waiting for the family owner");
  await expect(card.getByRole("button", { name: "Approve payment" })).toHaveCount(0);
});

test("full concierge path: coordinator onboards, parent consent call, policy upload, timer, hours", async ({ page, browser }) => {
  const stamp = Date.now();
  const ownerEmail = `new-owner-${stamp}@${DEMO}`;
  const phone = `+9198${String(stamp).slice(-8)}`;

  await signInStaff(page, "meera");
  await page.goto("/ops/onboard");
  await page.getByLabel("Owner's name").fill("Asha Test");
  await page.getByLabel("Owner's email").fill(ownerEmail);
  await page.getByLabel("Parent's name").fill("Ramesh Testwala");
  await page.getByLabel("Parent's WhatsApp number").fill(phone);
  await page.getByLabel("City in India").fill("Surat");
  await page.getByLabel("Language").selectOption("Gujarati");
  await page.getByRole("button", { name: "Create family" }).click();

  await expect(page).toHaveURL(/\/ops\/consent\//);
  const familyId = page.url().split("/").pop()!;
  await expect(page.getByText("તમારું કામ કરવા માટે")).toBeVisible();

  // Before the call, uploads are refused.
  await page.goto(`/family/${familyId}/documents`);
  await expect(page.getByText("once your parent's consent call is finished")).toBeVisible();

  await page.goto(`/ops/consent/${familyId}`);
  await page.getByLabel(/Read it to pull out key facts/).filter({ visible: true }).check();
  await page.getByLabel(/Keep it in the vault/).filter({ visible: true }).check();
  await page.getByLabel("Note about the call").filter({ visible: true }).fill("Spoke for 10 minutes, agreed.");
  await page.getByRole("button", { name: "Record the call" }).click();
  await expect(page.getByText("Consent is on file and the desk can start")).toBeVisible();

  // Owner gets their own consent step.
  const ownerCtx = await browser.newContext({ baseURL: "http://localhost:3100", channel: "chrome" } as object);
  const owner = await ownerCtx.newPage();
  await magicLink(owner, ownerEmail);
  await expect(owner).toHaveURL(new RegExp(familyId));
  await expect(owner.getByText("Please confirm your consent")).toBeVisible();
  await owner.getByRole("checkbox").nth(0).check();
  await owner.getByRole("checkbox").nth(1).check();
  await owner.getByRole("button", { name: "Confirm" }).click();
  await expect(owner.getByText("All on track")).toBeVisible();
  await ownerCtx.close();

  // Upload a policy with field confidence.
  await page.goto(`/family/${familyId}/documents`);
  await expect(page.getByRole("button", { name: "Upload" })).toBeEnabled();
  await page.getByLabel(/^File/).filter({ visible: true }).setInputFiles({ name: "test-policy.pdf", mimeType: "application/pdf", buffer: SAMPLES.policy });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Saved and read.")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Sample General Insurance").first()).toBeVisible();

  // Work on it and see the money.
  await page.goto("/ops");
  await page.locator("table").getByRole("link", { name: "Consent call: Ramesh Testwala" }).first().waitFor({ state: "detached" }).catch(() => {});
  await page.goto("/ops/new");
  await page.getByLabel("Family").selectOption({ label: "Testwala family" });
  await page.getByLabel("Template").selectOption({ label: "Records collection (2 h budget)" });
  await page.getByRole("button", { name: "Create task" }).click();
  await page.getByLabel("Hours", { exact: true }).fill("7");
  await page.getByLabel("Minutes", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Add time" }).click();
  await expect(page.getByText("Added 420 min")).toBeVisible();
  await page.goto("/ops/families");
  const row = page.locator('tr[data-family="Testwala family"]:visible');
  await expect(row).toContainText("7.0");
  await expect(row).toContainText("Over hour budget");
  // 7 h x $2.917 x 1.15 + $6.742 + 4.5% of $79 = $33.78 cost, so (79 - 33.78) / 79 = 57%.
  await expect(row.getByTestId("margin")).toHaveText("57%");
});

test("owner signs up on their own and records consent per purpose", async ({ page }) => {
  await magicLink(page, `self-serve-${Date.now()}@${DEMO}`);
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Parent's name").fill("Sunita Selfserve");
  await page.getByLabel("Parent's WhatsApp number").fill(`+9197${String(Date.now()).slice(-8)}`);
  await page.getByLabel("City in India").fill("Nagpur");
  await page.getByLabel(/Language/).selectOption("Marathi");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Finish" })).toBeDisabled();
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/family\//);
  await expect(page.getByText("Waiting for the consent call")).toBeVisible();
});

test("an owner cannot record their parent's consent", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/ops/consent/${FAM.shah}`);
  await expect(page).not.toHaveURL(/\/ops\/consent/);
});

test("claim checklist: desk marks a document received and the owner sees it", async ({ page }) => {
  await signInStaff(page, "meera");
  await page.goto(`/family/${FAM.shah}/claims`);
  await page.getByRole("button", { name: "Mark as received: Itemised final bill" }).click();
  await expect(page.getByRole("button", { name: "Mark as still missing: Itemised final bill" })).toBeVisible();
  await page.context().clearCookies();
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/claims`);
  const item = page.locator("li", { hasText: "Itemised final bill" }).filter({ visible: true });
  await expect(item).toContainText("Received");
  await expect(page.locator("li", { hasText: "Signed discharge summary" }).filter({ visible: true })).toContainText("Still missing");
  await expect(page.getByRole("button", { name: /Mark as/ })).toHaveCount(0);
});

test("coordinator raises an approval and the owner sees it", async ({ page }) => {
  await signInStaff(page, "meera");
  await page.goto("/ops");
  await page.locator("table").getByRole("link", { name: "Renewal quotes for health policy" }).click();
  await page.getByLabel("What is it?").fill("Renew health policy");
  await page.getByLabel("Who is paid or sent to?").fill("Demo Insurer A");
  await page.getByLabel("Amount (Rs)").fill("12000");
  await page.getByLabel("When", { exact: true }).fill("By 1 Dec");
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByText("Nothing happens until they say yes")).toBeVisible();
  await page.context().clearCookies();
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/approvals`);
  await expect(page.locator("article", { hasText: "Renew health policy" }).filter({ visible: true })).toContainText("Rs 12,000");
});

test("monthly report prints without the site chrome", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/report`);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("Family sections")).toBeHidden();
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  const pdf = await page.pdf();
  expect(pdf.byteLength).toBeGreaterThan(1000);
});
