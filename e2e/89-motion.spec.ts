import { expect, test } from "@playwright/test";
import { FAM, signInOwner } from "./helpers";

test("the hero plays by itself and the pause button stops it", async ({ page }) => {
  await page.goto("/");
  const claim = page.getByText("Pay electricity bill: Rs 4,200?");
  const opacity = () => claim.evaluate((e) => Number(getComputedStyle(e.closest("li")!).opacity));
  await expect.poll(opacity, { timeout: 10_000 }).toBeGreaterThan(0.9);

  await page.getByRole("button", { name: "Pause motion" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
  const state = await page.locator(".thread-dot").first().evaluate((e) => getComputedStyle(e).animationPlayState);
  expect(state).toBe("paused");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
  await expect(page.getByRole("button", { name: "Pause motion" })).toHaveAttribute("aria-pressed", "true");
});

test("headline words keep their spaces, and phones get a tidy header", async ({ page }) => {
  await page.goto("/");
  const gaps = await page.locator("h1 .word").evaluateAll((w) => w.slice(0, 3).map((e, i) => { const r = e.getBoundingClientRect(); const n = w[i + 1].getBoundingClientRect(); return n.top === r.top ? n.left - r.right : 10; }));
  for (const g of gaps) expect(g).toBeGreaterThan(4);
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.locator("header").getByRole("link", { name: "Live demo" })).toBeHidden();
});

test("the examples and the worry picker respond to a choice", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Claim", exact: true }).click();
  await expect(page.getByText("Discharge papers mil gaye hain.")).toBeVisible();
  await page.getByRole("button", { name: "Bills piling up" }).click();
  await expect(page.getByText("Forwards the bill on WhatsApp.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bills piling up" })).toHaveAttribute("aria-pressed", "true");
});

test("reduced motion shows the whole story at once and stops the ticker", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByText("Pay electricity bill: Rs 4,200?")).toBeVisible();
  const name = await page.locator(".marquee-track").evaluate((e) => getComputedStyle(e).animationName);
  expect(name).toBe("none");
});

test("the only properties any animation moves are transform and opacity", async ({ page }) => {
  await page.goto("/");
  const moved = await page.evaluate(() =>
    [...document.styleSheets].flatMap((sheet) => {
      try {
        return [...sheet.cssRules].filter((r): r is CSSKeyframesRule => r instanceof CSSKeyframesRule).flatMap((k) => [...k.cssRules].flatMap((f) => [...(f as CSSKeyframeRule).style]));
      } catch {
        return [];
      }
    }),
  );
  expect(moved.length).toBeGreaterThan(5);
  const allowed = new Set(["transform", "opacity", "translate", "rotate", "scale", "animation-timing-function"]);
  expect([...new Set(moved)].filter((p) => !allowed.has(p))).toEqual([]);
});

test("the family page shows the time where the parents are", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}`);
  await expect(page.getByText(/^In .+ it is$/)).toBeVisible();
  await expect(page.getByText(/^\d{1,2}:\d{2} (am|pm)$/)).toBeVisible();
});
