import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEMO, FAM, finishOnboardingSteps, magicLink, signInOwner, signInStaff } from "./helpers";

/**
 * Times what a customer waits for. Run with DB_SIMULATED_LATENCY_MS to reproduce a distant database,
 * and DB_TRACE=1 to count transactions from the server log.
 */
const LAG = Number(process.env.DB_SIMULATED_LATENCY_MS ?? 0);
const dbTx = (from: number, to: number) => {
  try {
    return readFileSync(".local/app.log", "utf8").split("\n").filter((l) => l.includes('"db_tx"')).map((l) => JSON.parse(l.slice(l.indexOf("{")))).filter((x) => { const t = Date.parse(x.at); return t >= from && t <= to; });
  } catch { return []; }
};

test("measure the waits a customer feels", async ({ page }) => {
  test.skip(!process.env.SPEED, "set SPEED=1 to run");
  test.setTimeout(600_000);
  const out: Record<string, number> = { simulatedLatencyMs: LAG };

  await signInOwner(page, "priya");
  for (const [name, path, ready] of [["home", `/family/${FAM.shah}`, "Needs your attention"], ["requests", `/family/${FAM.shah}/requests`, "My Requests"], ["documents", `/family/${FAM.shah}/documents`, "Document Vault"]] as const) {
    const t0 = Date.now();
    await page.goto(path, { waitUntil: "commit" });
    await page.locator("aside nav").first().waitFor({ timeout: 120_000 });
    out[`${name}ShellMs`] = Date.now() - t0;
    await page.getByText(ready).filter({ visible: true }).first().waitFor({ timeout: 120_000 });
    out[`${name}ContentMs`] = Date.now() - t0;
    out[`${name}DbTransactions`] = dbTx(t0, Date.now()).length;
    out[`${name}DbRoundTrips`] = dbTx(t0, Date.now()).reduce((s, x) => s + x.roundTrips, 0);
  }

  await page.context().clearCookies();
  await magicLink(page, `speed-${Date.now()}@${DEMO}`);
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 120_000 });
  await finishOnboardingSteps(page);
  const t1 = Date.now();
  await page.getByRole("button", { name: "Create my dashboard" }).click();
  await expect(page).toHaveURL(/\/family\//, { timeout: 120_000 });
  out.onboardingRedirectMs = Date.now() - t1;
  await page.getByText("Needs your attention").filter({ visible: true }).first().waitFor({ timeout: 120_000 });
  out.onboardingToDashboardMs = Date.now() - t1;
  out.onboardingDbTransactions = dbTx(t1, Date.now()).length;

  await page.context().clearCookies();
  await signInStaff(page, "meera");
  const t2 = Date.now();
  await page.goto("/ops", { waitUntil: "commit" });
  await page.getByText("Open requests").filter({ visible: true }).first().waitFor({ timeout: 120_000 });
  out.opsOverviewMs = Date.now() - t2;
  out.opsDbTransactions = dbTx(t2, Date.now()).length;

  mkdirSync(".local/qa", { recursive: true });
  writeFileSync(`.local/qa/speed-${LAG}ms-${process.env.SPEED_LABEL ?? "run"}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
});
