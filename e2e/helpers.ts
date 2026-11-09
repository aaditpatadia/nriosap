import { expect, type Page } from "@playwright/test";
import { localEnv } from "../scripts/local/env.mjs";

export const DEMO = "demo.ally.test";
export const PASSWORD = localEnv().SEED_STAFF_PASSWORD;
export const FAM = {
  shah: "f0000000-0000-4000-8000-000000000001",
  kulkarni: "f0000000-0000-4000-8000-000000000002",
  mehta: "f0000000-0000-4000-8000-000000000003",
};

export async function signInStaff(page: Page, who: "meera" | "rohan" | "kavita" | "admin") {
  await page.goto("/signin");
  await page.getByLabel("Work email").fill(`${who}@${DEMO}`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in to the desk" }).click();
  await expect(page).toHaveURL(/\/ops/);
}

export async function magicLink(page: Page, email: string) {
  await page.goto("/signin");
  await page.getByLabel("Your email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const res = await page.request.get(`http://127.0.0.1:54321/__inbox?email=${encodeURIComponent(email)}`);
  const { link } = (await res.json()) as { link: string };
  await page.goto(link);
}

export async function signInOwner(page: Page, who: "priya" | "mihir" | "neha" | "outsider") {
  await magicLink(page, `${who}@${DEMO}`);
}
