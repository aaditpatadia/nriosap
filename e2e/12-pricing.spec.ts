import { expect, test, type Page } from "@playwright/test";
import { FAM, signInOwner, signInStaff } from "./helpers";

const v = (p: Page, text: string | RegExp) => p.getByText(text).filter({ visible: true });
const nextTuesday = () => {
  const d = new Date(Date.now() + 3 * 86_400_000);
  while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

test("the calculator shows every line, and refuses what it must", async ({ browser }) => {
  test.setTimeout(120_000);
  const desk = await (await browser.newContext()).newPage();
  await signInStaff(desk, "admin");
  await desk.goto("/ops/pricing");
  await expect(v(desk, /starting values, not real trip costs/)).toBeVisible();

  // Nothing to price yet, so it says what is missing.
  await expect(desk.getByRole("alert").filter({ hasText: "Add the distance" })).toBeVisible();

  // A plain 10 km delivery, worked out by hand: rider Rs 110, EV Rs 18, fee 25% of Rs 128, total Rs 160.
  await desk.getByLabel("Road distance, one way (km)").filter({ visible: true }).fill("10");
  await expect(v(desk, "Rs 160").first()).toBeVisible();
  await expect(desk.getByRole("heading", { name: /^Rider/ })).toBeVisible();
  await expect(desk.getByRole("heading", { name: /^Electric vehicle/ })).toBeVisible();
  await expect(desk.getByRole("heading", { name: /^Ally service fee/ })).toBeVisible();
  await expect(v(desk, /Our fee Rs 32, which is 20% of what the customer pays and 25% on top of costs/)).toBeVisible();

  // Faster work costs more, on its own line.
  await desk.getByLabel("How soon?").filter({ visible: true }).selectOption("express");
  await expect(v(desk, /Rider, as soon as possible/)).toBeVisible();
  await expect(v(desk, "Rs 160")).toHaveCount(0);
  await desk.getByLabel("How soon?").filter({ visible: true }).selectOption("standard");

  // What it must refuse.
  await desk.getByLabel("Road distance, one way (km)").filter({ visible: true }).fill("60");
  await expect(desk.getByRole("alert").filter({ hasText: "up to 35 km in one trip" })).toBeVisible();
  await expect(v(desk, "Not yet")).toBeVisible();
  await desk.getByLabel("Road distance, one way (km)").filter({ visible: true }).fill("10");
  await desk.getByLabel("Weight (kg)").filter({ visible: true }).fill("40");
  await expect(desk.getByRole("alert").filter({ hasText: "over the 15 kg" })).toBeVisible();
  await desk.getByLabel("Weight (kg)").filter({ visible: true }).fill("2");
  await desk.getByLabel("Drop PIN code").filter({ visible: true }).fill("411001");
  await expect(desk.getByRole("alert").filter({ hasText: "outside Mumbai" })).toBeVisible();
  await desk.getByLabel("Drop PIN code").filter({ visible: true }).fill("400076");
  await desk.getByLabel("On the not-carried list").filter({ visible: true }).check();
  await expect(desk.getByRole("alert").filter({ hasText: "do not carry" })).toBeVisible();
  await desk.getByLabel("On the not-carried list").filter({ visible: true }).uncheck();
  await expect(v(desk, "Rs 160").first()).toBeVisible();

  // Rates for a customer's own currency, entered by hand here so the test calls nobody.
  await desk.getByLabel("Units per 1 rupee").filter({ visible: true }).fill("0.0106");
  await desk.getByRole("button", { name: "Save rate" }).click();
  await expect(v(desk, "Saved. It is marked as entered by hand.")).toBeVisible();
  await desk.reload();
  await desk.getByLabel("Road distance, one way (km)").filter({ visible: true }).fill("10");
  await desk.getByLabel("Show the customer's price in").filter({ visible: true }).selectOption("USD");
  await expect(v(desk, /About \$1\.70 at 1 USD = Rs 94\.34/)).toBeVisible();
});

test("a customer says where and when, the desk prices it from that, and the quotation says it is paid in full first", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/requests/new`);
  await page.getByLabel("What do you need handled in India?").filter({ visible: true }).fill("Please collect a passport file from my flat in Bandra and drop it at my CA's office in Powai.");
  await page.getByText("Where and when").first().click();
  await page.getByLabel("What should we do?").filter({ visible: true }).selectOption("delivery");
  const from = page.getByRole("group", { name: "Pick up from" });
  await from.getByLabel("Address").filter({ visible: true }).fill("12 Hill Road, Bandra West");
  await from.getByLabel("PIN code").filter({ visible: true }).fill("411001");
  await expect(v(page, /outside Mumbai/)).toBeVisible();
  await from.getByLabel("PIN code").filter({ visible: true }).fill("400050");
  await from.getByLabel("Name of someone there").filter({ visible: true }).fill("Asha");
  await from.getByLabel("Their phone").filter({ visible: true }).fill("+919800000000");
  const drop = page.getByRole("group", { name: "Drop at" });
  await drop.getByLabel("Address").filter({ visible: true }).fill("Hiranandani, Powai");
  await drop.getByLabel("PIN code").filter({ visible: true }).fill("400076");
  await page.getByLabel("Day", { exact: true }).filter({ visible: true }).fill(nextTuesday());
  await page.getByLabel("Earliest time").filter({ visible: true }).fill("10:00");
  await page.getByLabel("Latest time").filter({ visible: true }).fill("13:00");
  await page.getByLabel("In a few words").filter({ visible: true }).fill("Passport file");
  await page.getByLabel("Weight in kg").filter({ visible: true }).fill("1");
  await page.getByRole("button", { name: "Send to my coordinator" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const requestId = page.url().split("/").pop()!;
  await expect(v(page, "12 Hill Road, Bandra West, 400050")).toBeVisible();
  await expect(v(page, "To give you an exact price, we still need:")).toBeVisible(); // the drop-off contact, value and so on

  const desk = await (await browser.newContext()).newPage();
  await signInStaff(desk, "meera");
  await desk.goto(`/ops/requests/${requestId}`);
  await expect(v(desk, /Pick up and drop.*PIN 400050.*Passport file/)).toBeVisible();
  await expect(desk.getByRole("alert").filter({ hasText: "Add the distance" })).toBeVisible();

  // The desk asks for what is missing, in one message.
  await desk.getByRole("button", { name: "Ask the customer for these" }).click();
  await expect(v(desk, /Asked the customer for \d+ things?\./)).toBeVisible();
  await page.reload();
  await expect(v(page, "Awaiting Information").first()).toBeVisible();
  await expect(v(page, /To give you an exact price, please add/).first()).toBeVisible();

  // Priced from the customer's own details: a Tuesday at 10:00, so no night or Sunday extra.
  await desk.reload();
  await desk.getByLabel("Road distance, one way (km)").filter({ visible: true }).fill("9");
  await expect(v(desk, "Rs 150").first()).toBeVisible();
  await desk.getByLabel("Show the customer's price in").filter({ visible: true }).selectOption("USD");
  await desk.getByRole("button", { name: "Use this price in the quotation" }).click();
  await expect(v(desk, /Saved with rate card version \d+/)).toBeVisible();
  await expect(v(desk, /Filled from the price calculator, rate card version \d+/)).toBeVisible();
  await expect(v(desk, "Total: Rs 150")).toBeVisible();
  await expect(desk.getByLabel("Notes for the customer").filter({ visible: true })).toHaveValue("Pick up and drop. From 12 Hill Road, Bandra West to Hiranandani, Powai. About 9 km on an electric scooter. Today. Paid in full before the work starts.");
  await desk.getByRole("button", { name: "Send to the customer" }).click();
  await expect(v(desk, "Sent to the customer.")).toBeVisible();

  await page.reload();
  await expect(v(page, "Rs 150").first()).toBeVisible();
  await expect(v(page, "Paid in full before the work starts").first()).toBeVisible();
  await expect(v(page, "$1.59").first()).toBeVisible();
  await expect(v(page, /In USD at 1 USD = Rs 94\.34/)).toBeVisible();
  // The customer sees the quotation, never how it was built.
  await expect(page.getByText(/EV charging|Rider, per task/)).toHaveCount(0);
});

test("work cannot start until the full payment is confirmed", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/requests/new`);
  await page.getByLabel("What do you need handled in India?").filter({ visible: true }).fill("Please get the water meter in the flat in Bandra checked by next week.");
  await page.getByRole("button", { name: "Send to my coordinator" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const requestId = page.url().split("/").pop()!;
  const desk = await (await browser.newContext()).newPage();
  await signInStaff(desk, "meera");
  await desk.goto(`/ops/requests/${requestId}`);
  await desk.getByLabel("Provider fee (Rs)").filter({ visible: true }).fill("400");
  await desk.getByRole("button", { name: "Send to the customer" }).click();
  await expect(v(desk, "Sent to the customer.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Approve payment" }).filter({ visible: true }).click();
  await expect(v(page, "Approved").first()).toBeVisible();

  await desk.reload();
  await desk.getByLabel("Move to").filter({ visible: true }).selectOption("in_progress");
  await desk.getByRole("button", { name: "Update status" }).click();
  await expect(v(desk, "The customer pays in full before work starts. Confirm their payment first.")).toBeVisible();
  await desk.getByLabel("Payment link (https only)").filter({ visible: true }).fill("https://pay.example.test/water");
  await desk.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(v(desk, "Saved. The customer can see it now.")).toBeVisible();
  await desk.reload();
  await desk.getByLabel("Move to").filter({ visible: true }).selectOption("in_progress");
  await desk.getByRole("button", { name: "Update status" }).click();
  await expect(v(desk, "The customer pays in full before work starts. Confirm their payment first.")).toBeVisible(); // pending is not paid
  await desk.getByLabel("Payment reference").filter({ visible: true }).fill("UTR778899");
  await desk.getByRole("button", { name: "Mark confirmed" }).click();
  await desk.reload();
  await desk.getByLabel("Move to").filter({ visible: true }).selectOption("in_progress");
  await desk.getByRole("button", { name: "Update status" }).click();
  await expect(desk.getByRole("status").filter({ hasText: "Status updated." })).toBeVisible();
});

test("only an admin changes the rate card, every change is a new version, and the desk sees the new price", async ({ browser }) => {
  test.setTimeout(120_000);
  const coord = await (await browser.newContext()).newPage();
  await signInStaff(coord, "meera");
  await coord.goto("/ops/pricing");
  await expect(coord.getByRole("button", { name: "Save as a new version" })).toHaveCount(0);
  await expect(coord.getByLabel("Per task (Rs)", { exact: true }).filter({ visible: true })).toBeDisabled();

  const admin = await (await browser.newContext()).newPage();
  await signInStaff(admin, "admin");
  await admin.goto("/ops/pricing");
  await admin.getByLabel("Per task (Rs)", { exact: true }).filter({ visible: true }).fill("40");
  await admin.getByRole("button", { name: "Save as a new version" }).click();
  await expect(v(admin, "Say why you are changing the rates, in a few words.")).toHaveCount(0);
  await admin.getByLabel("Why are you changing the rates?").filter({ visible: true }).fill("first month of real trips");
  await admin.getByRole("button", { name: "Save as a new version" }).click();
  await expect(v(admin, "Saved as a new version. Old prices keep the rates they used.")).toBeVisible();
  await admin.reload();
  await admin.getByLabel("Road distance, one way (km)").filter({ visible: true }).first().fill("10");
  await expect(v(admin, "Rs 175").first()).toBeVisible(); // Rs 10 more for the rider
  await expect(v(admin, /first month of real trips/)).toBeVisible();

  // Put it back, so nothing else depends on this test.
  await admin.getByLabel("Per task (Rs)", { exact: true }).filter({ visible: true }).fill("30");
  await admin.getByLabel("Why are you changing the rates?").filter({ visible: true }).fill("back to the starting values");
  await admin.getByRole("button", { name: "Save as a new version" }).click();
  await expect(v(admin, "Saved as a new version. Old prices keep the rates they used.")).toBeVisible();

  // A mistake is refused, not saved.
  await admin.getByLabel("Ally fee (%)").filter({ visible: true }).fill("250");
  await admin.getByLabel("Why are you changing the rates?").filter({ visible: true }).fill("typo");
  await admin.getByRole("button", { name: "Save as a new version" }).click();
  await expect(admin.getByRole("status").filter({ hasText: /./ }).last()).toBeVisible();
  await expect(v(admin, "Saved as a new version. Old prices keep the rates they used.")).toHaveCount(0);
});

test("a customer cannot open the pricing page", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto("/ops/pricing");
  await expect(page).not.toHaveURL(/\/ops/);
});
