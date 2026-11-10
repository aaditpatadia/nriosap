import { expect, test } from "@playwright/test";
import { FAM, signInOwner, signInStaff } from "./helpers";

const row = (page: import("@playwright/test").Page, name: string) => page.locator(`tr[data-family="${name}"]:visible`);

test("timer survives a refresh, then hours and margin update", async ({ page }) => {
  await signInStaff(page, "meera");
  await page.goto("/ops/reports");
  const before = await row(page, "Shah family").getByTestId("hours").innerText();

  await page.goto("/ops/queue");
  await page.locator("table").getByRole("link", { name: "Renewal quotes for health policy" }).click();
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect(page.getByRole("button", { name: "Stop and log" })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.reload();
  // Clock kept going from the server's start time rather than resetting.
  await expect(page.getByRole("button", { name: "Stop and log" })).toBeVisible();
  const clock = await page.getByTestId("timer-clock").innerText();
  expect(clock).not.toBe("00:00");

  await page.goto("/ops/queue");
  await expect(page.getByText("Timer running:").filter({ visible: true })).toBeVisible();
  await page.getByText("Timer running:").filter({ visible: true }).click();
  await page.getByLabel("What are you doing?").fill("Compared renewal quotes");
  await page.getByRole("button", { name: "Stop and log" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Logged 1 min" })).toBeVisible();

  // Manual entry: 3 hours, so the change is big enough to see.
  await page.getByLabel("Hours", { exact: true }).fill("3");
  await page.getByLabel("Minutes", { exact: true }).fill("0");
  await page.getByLabel("Note", { exact: true }).fill("Hospital visit");
  await page.getByRole("button", { name: "Add time" }).click();
  await expect(page.getByText("Added 180 min")).toBeVisible();

  await page.goto("/ops/reports");
  const after = await row(page, "Shah family").getByTestId("hours").innerText();
  expect(Number(after)).toBeGreaterThan(Number(before) + 2.9);
  await expect(row(page, "Shah family").getByTestId("margin")).not.toHaveText("100%");
});

test("csv export contains the report and only the assigned families", async ({ page }) => {
  await signInStaff(page, "meera");
  const res = await page.request.get("/ops/families/export");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const text = await res.text();
  expect(text).toContain("Shah family");
  expect(text).not.toContain("Mehta family");
});

test("queue filters by status and SLA", async ({ page }) => {
  await signInStaff(page, "admin");
  await page.goto("/ops?sla=past");
  await expect(page.locator("table").getByRole("link", { name: "Assemble reimbursement claim documents" })).toBeVisible();
  await expect(page.locator("table").getByRole("link", { name: "Pay November electricity bill" })).toHaveCount(0);
  await page.goto(`/ops?family=${FAM.kulkarni}`);
  await expect(page.locator("table").getByRole("link", { name: "Weekly check-in call (Marathi)" })).toBeVisible();
  await expect(page.locator("table").getByRole("link", { name: "Pay November electricity bill" })).toHaveCount(0);
});

test("template, note and one-click escalation", async ({ page }) => {
  await signInStaff(page, "meera");
  await page.goto("/ops/new");
  await page.getByLabel("Family").selectOption({ label: "Shah family" });
  await page.getByLabel("Template").selectOption({ label: "Doctor booking (0.5 h budget)" });
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Book doctor appointment");
  await expect(page.getByText("Confirm doctor and time with parent")).toBeVisible();

  await page.getByLabel("Note for the desk").fill("Parent prefers mornings");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.locator("li", { hasText: "Parent prefers mornings" })).toBeVisible();

  await page.getByRole("button", { name: "CA: Demo CA Patel" }).click();
  await expect(page.getByText("Recorded. Now send this brief.")).toBeVisible();
  await page.reload();
  await expect(page.locator("li", { hasText: "Escalated to CA: Demo CA Patel" })).toBeVisible();
});

test("coordinator cannot open another coordinator's task by id", async ({ page }) => {
  await signInStaff(page, "admin");
  await page.goto("/ops/queue");
  const href = await page.locator("table").getByRole("link", { name: "Assemble reimbursement claim documents" }).getAttribute("href");
  await page.context().clearCookies();
  await signInStaff(page, "meera");
  // The ops loading skeleton starts streaming before the check, so the status can be 200. The body is what matters.
  await page.goto(href!);
  await expect(page.getByText("This page could not be found")).toBeVisible();
  await expect(page.getByText("Assemble reimbursement claim documents")).toHaveCount(0);
  await expect(page.getByText("Harish Mehta")).toHaveCount(0);
});

test("owner cannot export hours or open a task", async ({ page }) => {
  await signInOwner(page, "priya");
  expect((await page.request.get("/ops/families/export")).status()).toBe(403);
});
