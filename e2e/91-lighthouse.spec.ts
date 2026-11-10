import { expect, test } from "@playwright/test";
import { existsSync, writeFileSync } from "node:fs";
import { FAM, signInOwner, signInStaff } from "./helpers";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

test("lighthouse mobile on key routes", async ({ page }) => {
  test.skip(!existsSync("qa/node_modules/lighthouse"), "run npm --prefix qa install first");
  test.setTimeout(600_000);
  const lighthouse = (await import("../qa/node_modules/lighthouse/core/index.js" as string)).default;
  const launcher = await import("../qa/node_modules/chrome-launcher/dist/index.js" as string);
  const chrome = await launcher.launch({ chromePath: CHROME, chromeFlags: ["--headless=new", "--no-sandbox"] });

  const cookies = async () => (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const run = async (url: string, cookie?: string) => {
    const r = await lighthouse(`http://localhost:3100${url}`, { port: chrome.port, onlyCategories: ["performance", "accessibility", "best-practices", "seo"], formFactor: "mobile", logLevel: "error", extraHeaders: cookie ? { Cookie: cookie } : undefined });
    const c = r.lhr.categories, a = r.lhr.audits;
    return { url, perf: Math.round(c.performance.score * 100), a11y: Math.round(c.accessibility.score * 100), bestPractices: Math.round(c["best-practices"].score * 100), seo: Math.round(c.seo.score * 100), lcpMs: Math.round(a["largest-contentful-paint"].numericValue), cls: a["cumulative-layout-shift"].numericValue, tbtMs: Math.round(a["total-blocking-time"].numericValue), kb: Math.round(a["total-byte-weight"].numericValue / 1024), lcpEl: a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet };
  };

  const out = [await run("/"), await run("/trust"), await run("/signin")];
  await signInOwner(page, "priya");
  const owner = await cookies();
  out.push(await run(`/family/${FAM.shah}`, owner), await run(`/family/${FAM.shah}/approvals`, owner));
  await page.context().clearCookies();
  await signInStaff(page, "meera");
  const staff = await cookies();
  out.push(await run("/ops", staff), await run("/ops/families", staff));
  await chrome.kill();
  writeFileSync(".local/qa/lighthouse.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  for (const r of out) {
    expect(r.a11y, r.url).toBeGreaterThanOrEqual(95);
    expect(r.lcpMs, r.url).toBeLessThan(2500);
    expect(r.cls, r.url).toBeLessThan(0.1);
  }
});
