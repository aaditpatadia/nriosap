import { expect, test } from "@playwright/test";
import { FAM, signInOwner } from "./helpers";

test("the menu is drawn folded on the very first paint, before any script runs, and never covers the page", async ({ page, browser }) => {
  await signInOwner(page, "priya");
  const state = await page.context().storageState();
  const ctx = await browser.newContext({ javaScriptEnabled: false, storageState: state, baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "ally_sidebar", value: "1", url: "http://localhost:3100" }]);
  const p = await ctx.newPage();
  await p.goto(`/family/${FAM.shah}`);
  const side = await p.locator("aside.side").boundingBox();
  const content = await p.locator(".content").boundingBox();
  expect(side!.width).toBe(72);
  expect(content!.x).toBeGreaterThanOrEqual(side!.x + side!.width);
  await expect(p.locator(".shell")).toHaveAttribute("data-collapsed", "true");
  await ctx.close();

  const open = await browser.newContext({ javaScriptEnabled: false, storageState: state, baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  const q = await open.newPage();
  await q.goto(`/family/${FAM.shah}`);
  expect((await q.locator("aside.side").boundingBox())!.width).toBe(256);
  await open.close();
});

test("folding remembers across a reload with no jump, and an old browser setting is carried over once", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/family/${FAM.shah}`);
  await page.getByRole("button", { name: "Fold the menu" }).click();
  expect((await page.context().cookies()).find((c) => c.name === "ally_sidebar")?.value).toBe("1");
  await page.reload();
  await expect(page.locator(".shell")).toHaveAttribute("data-collapsed", "true");
  expect((await page.locator("aside.side").boundingBox())!.width).toBe(72);
  await page.mouse.move(900, 500);
  // The old way of remembering, a browser-only flag, is read once and moved to the cookie.
  await page.context().clearCookies({ name: "ally_sidebar" });
  await page.evaluate(() => localStorage.setItem("sidebar-collapsed", "1"));
  await page.reload();
  await expect(page.locator(".shell")).toHaveAttribute("data-collapsed", "true");
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === "ally_sidebar")?.value).toBe("1");
});
