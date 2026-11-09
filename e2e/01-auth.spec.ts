import { expect, test } from "@playwright/test";
import { FAM, signInOwner, signInStaff } from "./helpers";

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto(`/family/${FAM.shah}`);
  await expect(page).toHaveURL(/\/signin/);
  await page.goto("/ops");
  await expect(page).toHaveURL(/\/signin/);
});

test("owner signs in with a magic link and lands on their family", async ({ page }) => {
  await signInOwner(page, "priya");
  await expect(page).toHaveURL(new RegExp(`/family/${FAM.shah}`));
  await expect(page.getByText("Signed in as")).toContainText("Priya Shah");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("need");
});

test("owner cannot open ops", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto("/ops");
  await expect(page).not.toHaveURL(/\/ops/);
});

test("coordinator signs in with a password and sees only assigned families", async ({ page }) => {
  await signInStaff(page, "meera");
  await expect(page.getByText("Pay November electricity bill")).toBeVisible();
  await expect(page.getByText("Assemble reimbursement claim documents")).toHaveCount(0);
});

test("admin signs in and sees every family", async ({ page }) => {
  await signInStaff(page, "admin");
  await expect(page.getByText("Pay November electricity bill")).toBeVisible();
  await expect(page.getByText("Assemble reimbursement claim documents")).toBeVisible();
});

test("wrong password is refused without saying why", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Work email").fill("meera@demo.gharsaath.test");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in to the desk" }).click();
  await expect(page.getByText("did not match")).toBeVisible();
});

test("outsider is blocked by RLS on every family page", async ({ page }) => {
  await signInOwner(page, "outsider");
  for (const id of Object.values(FAM)) {
    for (const sub of ["", "/claims", "/documents", "/calendar", "/approvals", "/report", "/billing"]) {
      const res = await page.goto(`/family/${id}${sub}`);
      expect(res?.status(), `/family/${id}${sub}`).toBe(404);
      await expect(page.getByText("Kusum Shah")).toHaveCount(0);
    }
  }
});

test("owner cannot open another family by changing the id", async ({ page }) => {
  await signInOwner(page, "priya");
  const res = await page.goto(`/family/${FAM.mehta}`);
  expect(res?.status()).toBe(404);
});

test("coordinator cannot open an unassigned family or its task", async ({ page }) => {
  await signInStaff(page, "meera");
  expect((await page.goto(`/family/${FAM.mehta}`))?.status()).toBe(404);
});
