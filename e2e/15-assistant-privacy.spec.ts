import { expect, test, type Page } from "@playwright/test";
import { FAM, signInOwner } from "./helpers";

const v = (p: Page, text: string | RegExp) => p.getByText(text).filter({ visible: true });
const ask = async (page: Page, q: string) => {
  await page.getByLabel("Ask Ally").filter({ visible: true }).fill(q);
  await page.getByRole("button", { name: "Ask", exact: true }).filter({ visible: true }).click();
};

test("Ally Assistant says what it can do, takes people straight to the right place, and says no kindly", async ({ page }) => {
  test.setTimeout(150_000);
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/ask`);

  // A welcome with things to try, in groups, before anything is typed.
  await expect(v(page, "Hello. How can I help?")).toBeVisible();
  for (const g of ["Get something done", "Find your way around", "In your records"]) await expect(v(page, g).first()).toBeVisible();

  await page.getByRole("button", { name: "What can you do?" }).click();
  await expect(v(page, /We are in Mumbai only for now/)).toBeVisible();
  const go = page.getByRole("link", { name: "Send a voice note instead" }).filter({ visible: true });
  await expect(go).toBeVisible();
  await go.click();
  await expect(page).toHaveURL(/\/requests\/new#voice$/);
  await expect(page.getByRole("heading", { name: /Rather talk than type/ })).toBeVisible();

  await page.goBack();
  await ask(page, "How do I upload a document?");
  await expect(page.getByRole("link", { name: "Open Documents" }).filter({ visible: true }).first()).toHaveAttribute("href", `/family/${FAM.shah}/documents`);

  // Another city: a kind no, with a way to stay in touch.
  await ask(page, "I need a plumber in Pune");
  await expect(v(page, /We only work in Mumbai for now/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Join the waitlist" }).filter({ visible: true })).toHaveAttribute("href", "/#waitlist");

  // Something we do not do, and a person to talk to.
  await ask(page, "Can you give me a loan?");
  await expect(v(page, /not something we do/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Message us on WhatsApp" }).filter({ visible: true }).last()).toHaveAttribute("href", /https:\/\/wa\.me\/918097020725/);

  // It does not guess.
  await ask(page, "xylophone quartz");
  await expect(v(page, /I do not know the answer, so I will not guess/)).toBeVisible();

  // Still refuses to act, and still reads the person's own records.
  await ask(page, "Pay the electricity bill for me");
  await expect(v(page, "I cannot pay, sign, file or approve anything.")).toBeVisible();
});

test("the privacy page is tidy: consent by person, a short grouped log, and the dangerous option tucked away", async ({ page }) => {
  test.setTimeout(120_000);
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/privacy`);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy and your data" })).toBeVisible();
  for (const h of ["Consent", "Who opened what", "Your data"]) await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();

  // Consent is a card per person with one status each, not a wall of lines.
  await expect(page.getByRole("heading", { level: 2, name: "Priya Shah" }).or(page.getByRole("heading", { level: 2, name: "You" })).first()).toBeVisible();
  await expect(v(page, "All given").first()).toBeVisible();

  // The log is in plain words, grouped by day, short at first, and filterable.
  const log = page.locator("#activity");
  await expect(log.getByRole("button", { name: "Documents" })).toBeVisible();
  await expect(log.getByText(/[a-z]+_[a-z]+/)).toHaveCount(0); // no code names
  expect(await log.locator("li").count()).toBeLessThanOrEqual(8);
  await log.getByRole("button", { name: "Documents" }).click();
  await expect(log.getByRole("button", { name: "Documents" })).toHaveAttribute("aria-pressed", "true");
  await log.getByRole("button", { name: "Everything" }).click();

  // Nothing dangerous is open by default.
  await expect(page.getByLabel(/^Type .+ to confirm/)).toBeHidden();
  await page.getByText("Delete everything").filter({ visible: true }).first().click();
  await expect(page.getByLabel(/^Type .+ to confirm/).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download as JSON" })).toBeVisible();
});
