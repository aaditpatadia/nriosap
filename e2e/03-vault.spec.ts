import { expect, test, type Page } from "@playwright/test";
import { SAMPLES } from "./fixtures";
import { FAM, signInOwner, signInStaff } from "./helpers";

async function upload(page: Page, name: string, buffer: Buffer, mimeType = "application/pdf") {
  await expect(page.getByRole("button", { name: "Upload" })).toBeEnabled();
  await page.getByLabel(/^File/).filter({ visible: true }).setInputFiles({ name, mimeType, buffer });
  await page.getByRole("button", { name: "Upload" }).click();
}

test("policy uploads, fields come back with confidence, number is masked and encrypted at rest", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/documents`);
  await upload(page, "sample-policy.pdf", SAMPLES.policy);
  await expect(page.getByText("Saved and read.")).toBeVisible({ timeout: 30000 });
  const card = page.locator("li", { hasText: "sample-policy.pdf" }).filter({ visible: true });
  await expect(card).toContainText("Sample General Insurance");
  await expect(card).toContainText("Rs 7,50,000");
  await expect(card).toContainText("96%");
  await expect(card).not.toContainText("SGI-44871-2026");
});

test("low confidence forces a coordinator check, which then clears", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/documents`);
  await upload(page, "blurry-policy.pdf", SAMPLES.blurry);
  await expect(page.getByText("A coordinator will check")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("li", { hasText: "blurry-policy.pdf" }).filter({ visible: true })).toContainText("Needs a human check");

  await page.context().clearCookies();
  await signInStaff(page, "meera");
  await page.goto("/ops/queue");
  await page.locator("table").getByRole("link", { name: "Check document: blurry-policy.pdf" }).click();
  await page.getByRole("link", { name: "Check the fields" }).click();
  await expect(page.getByText("Check this: 71%").first()).toBeVisible();
  await page.getByLabel(/^Policy number/).fill("SGI-44871");
  await page.getByRole("button", { name: "Confirm these details" }).click();
  await expect(page.getByText("Checked. Thank you.")).toBeVisible();
  await page.goto("/ops/queue");
  await expect(page.locator("table").getByRole("link", { name: "Check document: blurry-policy.pdf" })).toHaveCount(0);
});

test("bill and discharge summary extract their own fields", async ({ page }) => {
  await signInStaff(page, "meera");
  await page.goto(`/family/${FAM.shah}/documents`);
  await upload(page, "sample-bill.pdf", SAMPLES.bill);
  await expect(page.locator("li", { hasText: "sample-bill.pdf" }).filter({ visible: true })).toContainText("Sample Power Ltd", { timeout: 30000 });
  await upload(page, "sample-discharge.pdf", SAMPLES.discharge);
  await expect(page.locator("li", { hasText: "sample-discharge.pdf" }).filter({ visible: true })).toContainText("2026-10-24", { timeout: 30000 });
});

test("a model refusal becomes a human task, not a silent failure", async ({ page }) => {
  await signInStaff(page, "meera");
  await page.goto(`/family/${FAM.shah}/documents`);
  await upload(page, "refused.pdf", SAMPLES.refused);
  await expect(page.getByText("A coordinator will check")).toBeVisible({ timeout: 30000 });
  await page.goto("/ops/queue");
  await expect(page.locator("table").getByRole("link", { name: "Check document: refused.pdf" })).toBeVisible();
});

test("wrong type, oversize and infected files are refused", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/documents`);
  await upload(page, "looks-fine.pdf", Buffer.from("MZ this is really an executable"));
  await expect(page.getByText("We accept PDF, JPG, PNG and WebP")).toBeVisible();
  await upload(page, "big.pdf", Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(5 * 1024 * 1024)]));
  await expect(page.getByText("under 4 MB")).toBeVisible();
  await upload(page, "virus.pdf", SAMPLES.eicar);
  await expect(page.getByText("did not pass the safety check")).toBeVisible();
});

test("file opens through a signed link for the family and nobody else", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/documents`);
  await upload(page, "signed-check.pdf", SAMPLES.bill);
  const link = page.locator("li", { hasText: "signed-check.pdf" }).filter({ visible: true }).getByRole("link", { name: /^Open/ });
  await expect(link).toBeVisible({ timeout: 30000 });
  const href = (await link.getAttribute("href"))!;

  const own = await page.request.get(href, { maxRedirects: 0 });
  expect(own.status()).toBe(303);
  const signed = own.headers().location;
  expect(signed).toContain("token=");
  expect((await page.request.get(signed)).status()).toBe(200);

  await page.context().clearCookies();
  await signInOwner(page, "outsider");
  expect((await page.request.get(href, { maxRedirects: 0 })).status()).toBe(404);
  await page.context().clearCookies();
  await signInStaff(page, "rohan");
  expect((await page.request.get(href, { maxRedirects: 0 })).status()).toBe(404);
});

test("outsider cannot upload to a family they cannot see", async ({ page }) => {
  await signInOwner(page, "outsider");
  await page.goto("/signin");
  const res = await page.request.post("/api/documents", {
    headers: { origin: "http://localhost:3100" },
    multipart: { familyId: FAM.shah, purpose: "store", file: { name: "x.pdf", mimeType: "application/pdf", buffer: SAMPLES.bill } },
  });
  expect(res.status()).toBe(404);
});

test("a cross-site upload is refused", async ({ page }) => {
  await signInOwner(page, "priya");
  const res = await page.request.post("/api/documents", {
    headers: { origin: "https://evil.example" },
    multipart: { familyId: FAM.shah, purpose: "store", file: { name: "x.pdf", mimeType: "application/pdf", buffer: SAMPLES.bill } },
  });
  expect(res.status()).toBe(403);
});

test("withdrawing the store consent removes the file", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/documents`);
  await upload(page, "remove-me.pdf", SAMPLES.bill);
  const card = page.locator("li", { hasText: "remove-me.pdf" }).filter({ visible: true });
  const href = (await card.getByRole("link", { name: /^Open/ }).getAttribute("href", { timeout: 30000 }))!;
  await card.getByRole("button", { name: "Remove from vault" }).click();
  await card.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(page.locator("li", { hasText: "remove-me.pdf" })).toHaveCount(0);
  expect((await page.request.get(href, { maxRedirects: 0 })).status()).toBe(404);
});
