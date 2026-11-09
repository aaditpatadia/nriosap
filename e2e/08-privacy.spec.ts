import { expect, test } from "@playwright/test";

test("anyone can reach the privacy policy from the footer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
});

test("the policy says it is a draft and covers Google sign-in", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "This is a draft" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "If you sign in with Google" })).toBeVisible();
  await expect(page.getByText("We do not sell your data.")).toBeVisible();
});

test("the policy fills the width on a large screen", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1200 });
  await page.goto("/privacy");
  const width = await page.locator("main").first().evaluate((e) => {
    const kids = [...e.querySelectorAll("h1, .card")].map((x) => x.getBoundingClientRect());
    return Math.max(...kids.map((r) => r.right)) - Math.min(...kids.map((r) => r.left));
  });
  expect(width).toBeGreaterThan(2200);
  const last = await page.locator(".card", { hasText: "Cookies and your browser" }).evaluate((e) => e.getBoundingClientRect().width);
  expect(last, "the last card leaves no empty space beside it").toBeGreaterThan(2200);
});
