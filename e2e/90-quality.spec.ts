import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { FAM, signInOwner, signInStaff } from "./helpers";

const OUT = ".local/qa";
mkdirSync(`${OUT}/shots`, { recursive: true });

const PUBLIC = [["home", "/"], ["demo", "/demo"], ["trust", "/trust"], ["privacy", "/privacy"], ["signin", "/signin"], ["goodbye", "/goodbye"]] as const;
const familyPages = (id: string) => ["", "/requests", "/requests/new", "/claims", "/documents", "/properties", "/people", "/details", "/ask", "/activity", "/settings", "/bills", "/bills?view=calendar", "/approvals", "/report", "/billing", "/privacy"].map((s) => [`family${s.replace("/", "-").replace("?", "-").replace("=", "-")}`, `/family/${id}${s}`] as const);

async function staffRoutes(page: Page) {
  await page.goto("/ops/queue");
  const task = await page.locator("table").getByRole("link", { name: "Pay November electricity bill" }).getAttribute("href");
  return [
    ["ops-overview", "/ops"], ["ops-queue", "/ops/queue"], ["ops-requests", "/ops/requests"], ["ops-hours", "/ops/reports"], ["ops-families", "/ops/families"], ["ops-family", `/ops/families/${FAM.shah}`], ["ops-partners", "/ops/partners"], ["ops-properties", "/ops/properties"], ["ops-documents", "/ops/documents"], ["ops-approvals", "/ops/approvals"], ["ops-visits", "/ops/visits"], ["ops-new", "/ops/new"], ["ops-onboard", "/ops/onboard"], ["ops-settings", "/ops/settings"],
    ["ops-task", task!], ["ops-messages", `/ops/messages/${FAM.shah}`], ["ops-consent", `/ops/consent/${FAM.shah}`], ["chat", `/chat/${FAM.shah}`],
    ...familyPages(FAM.shah),
  ] as [string, string][];
}

const results: string[] = [];
const VIEWPORTS = [375, 768, 1440];
const SCHEMES = ["light", "dark"] as const;

async function sweep(page: Page, routes: readonly (readonly [string, string])[], prefix: string, summary: Record<string, number>) {
  for (const [name, url] of routes) {
    for (const colorScheme of SCHEMES) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url);
        await page.waitForLoadState("networkidle");
        // Scroll through once so sections that fade in on view are shown in the capture.
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } window.scrollTo(0, 0); });
        await expect(page.locator("#main:visible, main:visible").first()).toBeVisible();
        // axe on every route, in each scheme, at phone and desktop width.
        if (width !== 768) {
          const a = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
          summary.axeRuns++;
          for (const v of a.violations) {
            summary.violations += v.nodes.length;
            results.push(`AXE ${prefix}/${name} ${colorScheme} ${width}: ${v.id} ${v.nodes.length}x ${v.nodes[0]?.target}`);
          }
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 0) { summary.overflow++; results.push(`OVERFLOW ${prefix}/${name} ${colorScheme} ${width}: ${overflow}px`); }
        const small = await page.evaluate(() => [...document.querySelectorAll("main a.btn, main button, header a, header button, nav a")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44; }).map((e) => (e.textContent ?? "").trim().slice(0, 30)));
        if (small.length) { summary.smallTargets += small.length; results.push(`TARGET ${prefix}/${name} ${width}: ${small.slice(0, 4).join(" | ")}`); }
        await page.screenshot({ path: `${OUT}/shots/${prefix}-${name}-${width}-${colorScheme}.png`, fullPage: true });
        summary.shots++;
      }
    }
  }
}

test("axe, overflow, touch targets and screenshots on every route", async ({ page }) => {
  test.setTimeout(3_000_000);
  const s = { axeRuns: 0, violations: 0, overflow: 0, smallTargets: 0, shots: 0 };
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()} ${m.text().slice(0, 160)}`); });
  await sweep(page, PUBLIC, "public", s);
  await signInOwner(page, "priya");
  await sweep(page, familyPages(FAM.shah), "owner", s);
  await page.context().clearCookies();
  await signInStaff(page, "meera");
  const routes = await staffRoutes(page);
  await sweep(page, routes.filter(([n]) => !n.startsWith("family")), "staff", s);
  writeFileSync(`${OUT}/summary.json`, JSON.stringify({ ...s, consoleErrors: errors.length }, null, 2));
  writeFileSync(`${OUT}/findings.txt`, [...results, ...errors.map((e) => `CONSOLE ${e}`)].join("\n"));
  console.log(JSON.stringify({ ...s, consoleErrors: errors.length }));
  expect(s.violations, results.join("\n")).toBe(0);
  expect(s.overflow, results.join("\n")).toBe(0);
  expect(s.smallTargets, results.join("\n")).toBe(0);
  expect(errors).toEqual([]);
});

test("the site stays white even when the computer is in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).not.toBe("rgb(13, 20, 28)");
  await expect(page.getByRole("button", { name: "Larger text" })).toHaveCount(0);
});

