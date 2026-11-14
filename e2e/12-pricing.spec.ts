import { expect, test, type Locator, type Page } from "@playwright/test";
import { FAM, signInOwner, signInStaff } from "./helpers";

const v = (p: Page, text: string | RegExp) => p.getByText(text).filter({ visible: true });
const nextTuesday = () => {
  const d = new Date(Date.now() + 3 * 86_400_000);
  while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
const L = (p: Page | Locator, name: string, exact = false) => p.getByLabel(name, { exact }).filter({ visible: true });

test("the calculator prices by time, shows rupees and dollars, and refuses what it must", async ({ browser }) => {
  test.setTimeout(150_000);
  const desk = await (await browser.newContext()).newPage();
  await signInStaff(desk, "admin");
  await desk.goto("/ops/pricing");
  await expect(v(desk, /starting values, not real trip costs/)).toBeVisible();

  // Nothing to price yet, so it says what is missing, one thing at a time.
  await expect(desk.getByRole("alert").filter({ hasText: "Add the distance" })).toBeVisible();
  await L(desk, "Road distance, one way (km)").fill("9");
  await expect(desk.getByRole("alert").filter({ hasText: "US dollar rate" })).toBeVisible();

  // The price is set in dollars, so today's rate is entered first (by hand here, so the test calls nobody).
  await L(desk, "Units per 1 rupee").fill("0.0106");
  await desk.getByRole("button", { name: "Save rate" }).click();
  await expect(v(desk, "Saved. It is marked as entered by hand.")).toBeVisible();
  await desk.reload();
  await L(desk, "Road distance, one way (km)").fill("9");

  // A 9 km delivery: 30 minutes travelling and 16 at the two stops is 46 minutes, so two half-hour blocks at $7.
  await expect(desk.getByRole("heading", { name: "How the time adds up" })).toBeVisible();
  await expect(v(desk, "46 min").first()).toBeVisible();
  await expect(v(desk, /That is 2 blocks of 30 minutes at \$7: \$14\.00, or Rs 1,320\.76 at 1 USD = Rs 94\.34/)).toBeVisible();
  await expect(v(desk, "Rs 1,325").first()).toBeVisible();
  await expect(v(desk, "$14.05").first()).toBeVisible();
  await expect(desk.getByRole("heading", { name: /^Rider/ })).toBeVisible();
  await expect(desk.getByRole("heading", { name: /^Electric vehicle/ })).toBeVisible();
  await expect(desk.getByRole("heading", { name: /^Ally service/ })).toBeVisible();
  await expect(v(desk, /Fair price check/)).toBeVisible();

  // More time costs more: an hour at the place and some waiting.
  await L(desk, "Work at the place (minutes)").fill("60");
  await L(desk, "Waiting (minutes)", true).fill("20");
  await expect(v(desk, /That is 5 blocks of 30 minutes at \$7: \$35\.00/)).toBeVisible();
  await L(desk, "Work at the place (minutes)").fill("");
  await L(desk, "Waiting (minutes)", true).fill("");

  // The desk can overrule the travel time.
  await L(desk, "Travel time by hand (minutes, optional)").fill("5");
  await expect(v(desk, /Travel time was set by hand/)).toBeVisible();
  await L(desk, "Travel time by hand (minutes, optional)").fill("");

  // Faster work costs more, on its own line.
  await L(desk, "How soon?").selectOption("express");
  await expect(v(desk, /As soon as possible \(x1\.8\)/)).toBeVisible();
  await L(desk, "How soon?").selectOption("standard");

  // What it must refuse.
  await L(desk, "Road distance, one way (km)").fill("60");
  await expect(desk.getByRole("alert").filter({ hasText: "up to 35 km in one trip" })).toBeVisible();
  await L(desk, "Road distance, one way (km)").fill("9");
  await L(desk, "Weight (kg)").fill("40");
  await expect(desk.getByRole("alert").filter({ hasText: "over the 15 kg" })).toBeVisible();
  await L(desk, "Weight (kg)").fill("2");
  await L(desk, "Drop PIN code").fill("411001");
  await expect(desk.getByRole("alert").filter({ hasText: "outside Mumbai" })).toBeVisible();
  await L(desk, "Drop PIN code").fill("400076");
  await L(desk, "On the not-carried list").check();
  await expect(desk.getByRole("alert").filter({ hasText: "do not carry" })).toBeVisible();
  await L(desk, "On the not-carried list").uncheck();
  await expect(v(desk, "Rs 1,325").first()).toBeVisible();
});

test("a customer says where, when and for how long, the desk prices it from that, and the quotation shows rupees and dollars and says it is paid in full first", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/requests/new`);
  await L(page, "What do you need handled in India?").fill("Please collect a passport file from my flat in Bandra and drop it at my CA's office in Powai.");
  await page.getByText("Where and when").first().click();
  await L(page, "What should we do?").selectOption("delivery");
  const from = page.getByRole("group", { name: "Pick up from" });
  await L(from, "Address").fill("12 Hill Road, Bandra West");
  await L(from, "PIN code").fill("411001");
  await expect(v(page, /outside Mumbai/)).toBeVisible();
  await L(from, "PIN code").fill("400050");
  await L(from, "Name of someone there").fill("Asha");
  await L(from, "Their phone").fill("+919800000000");
  const drop = page.getByRole("group", { name: "Drop at" });
  await L(drop, "Address").fill("Hiranandani, Powai");
  await L(drop, "PIN code").fill("400076");
  await L(page, "About how long will the work take once we are there?").selectOption("30");
  await L(page, "Day", true).fill(nextTuesday());
  await L(page, "Earliest time").fill("10:00");
  await L(page, "Latest time").fill("13:00");
  await L(page, "In a few words").fill("Passport file");
  await L(page, "Weight in kg").fill("1");
  await page.getByRole("button", { name: "Send to my coordinator" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const requestId = page.url().split("/").pop()!;
  await expect(v(page, "12 Hill Road, Bandra West, 400050")).toBeVisible();
  await expect(v(page, "About 30 minutes")).toBeVisible();
  await expect(v(page, "To give you an exact price, we still need:")).toBeVisible();

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

  // 30 minutes travelling, 16 at the stops and the customer's own 30 is 76 minutes: three blocks, a Tuesday at 10:00.
  await desk.reload();
  await L(desk, "Road distance, one way (km)").fill("9");
  await expect(v(desk, /That is 3 blocks of 30 minutes at \$7: \$21\.00/)).toBeVisible();
  await expect(v(desk, "Rs 1,985").first()).toBeVisible();
  await expect(v(desk, "$21.04").first()).toBeVisible();
  await desk.getByRole("button", { name: "Use this price in the quotation" }).click();
  await expect(v(desk, /Saved with rate card version \d+/)).toBeVisible();
  await expect(v(desk, /Filled from the price calculator, rate card version \d+/)).toBeVisible();
  await expect(v(desk, "Total: Rs 1,985")).toBeVisible();
  await expect(L(desk, "Notes for the customer")).toHaveValue(/About 76 minutes in all \(30 travelling, 46 at the places and waiting\), charged as 3 half-hours\. Today\. Paid in full before the work starts\./);
  await desk.getByRole("button", { name: "Send to the customer" }).click();
  await expect(v(desk, "Sent to the customer.")).toBeVisible();

  await page.reload();
  await expect(v(page, "Rs 1,985").first()).toBeVisible();
  await expect(v(page, "$21.04").first()).toBeVisible();
  await expect(v(page, "In US dollars").first()).toBeVisible();
  await expect(v(page, /Dollars at 1 USD = Rs 94\.34/)).toBeVisible();
  await expect(v(page, "Paid in full before the work starts").first()).toBeVisible();
  // The customer sees the quotation, never how it was built.
  await expect(page.getByText(/EV charging|Rider, per task|Fair price check/)).toHaveCount(0);
});

test("work cannot start until the full payment is confirmed", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signInOwner(page, "priya");
  await page.goto(`/family/${FAM.shah}/requests/new`);
  await L(page, "What do you need handled in India?").fill("Please get the water meter in the flat in Bandra checked by next week.");
  await page.getByRole("button", { name: "Send to my coordinator" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const requestId = page.url().split("/").pop()!;
  const desk = await (await browser.newContext()).newPage();
  await signInStaff(desk, "meera");
  await desk.goto(`/ops/requests/${requestId}`);
  await L(desk, "Provider fee (Rs)").fill("400");
  await desk.getByRole("button", { name: "Send to the customer" }).click();
  await expect(v(desk, "Sent to the customer.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Approve payment" }).filter({ visible: true }).click();
  await expect(v(page, "Approved").first()).toBeVisible();

  await desk.reload();
  await L(desk, "Move to").selectOption("in_progress");
  await desk.getByRole("button", { name: "Update status" }).click();
  await expect(v(desk, "The customer pays in full before work starts. Confirm their payment first.")).toBeVisible();
  await L(desk, "Payment link (https only)").fill("https://pay.example.test/water");
  await desk.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(v(desk, "Saved. The customer can see it now.")).toBeVisible();
  await desk.reload();
  await L(desk, "Move to").selectOption("in_progress");
  await desk.getByRole("button", { name: "Update status" }).click();
  await expect(v(desk, "The customer pays in full before work starts. Confirm their payment first.")).toBeVisible(); // pending is not paid
  await L(desk, "Payment reference").fill("UTR778899");
  await desk.getByRole("button", { name: "Mark confirmed" }).click();
  await desk.reload();
  await L(desk, "Move to").selectOption("in_progress");
  await desk.getByRole("button", { name: "Update status" }).click();
  await expect(desk.getByRole("status").filter({ hasText: "Status updated." })).toBeVisible();
});

test("only an admin changes the rate card, every change is a new version, and the desk sees the new price", async ({ browser }) => {
  test.setTimeout(300_000);
  const coord = await (await browser.newContext()).newPage();
  await signInStaff(coord, "meera");
  await coord.goto("/ops/pricing");
  await expect(coord.getByRole("button", { name: "Save as a new version" })).toHaveCount(0);
  await expect(L(coord, "Price of one block (US dollars)")).toBeDisabled();

  const admin = await (await browser.newContext()).newPage();
  await signInStaff(admin, "admin");
  const save = async (note: string) => {
    await L(admin, "Why are you changing the rates?").fill(note);
    await admin.getByRole("button", { name: "Save as a new version" }).click();
    await expect(v(admin, "Saved as a new version. Old prices keep the rates they used.")).toBeVisible();
    await admin.reload();
  };
  await admin.goto("/ops/pricing");
  await L(admin, "Price of one block (US dollars)").fill("8");
  await save("first month of real trips");
  await L(admin, "Road distance, one way (km)").first().fill("9");
  await expect(v(admin, "Rs 1,510").first()).toBeVisible(); // two blocks at $8
  await expect(v(admin, /first month of real trips/)).toBeVisible();

  // The old cost-plus way is one setting away, and needs no dollar rate.
  await L(admin, "Price of one block (US dollars)").fill("7");
  await admin.locator('select[name="pricingMode"]').selectOption("cost");
  await save("trying cost plus");
  await L(admin, "Road distance, one way (km)").first().fill("10");
  await expect(v(admin, "Rs 160").first()).toBeVisible();
  await expect(v(admin, /Our fee Rs 32, which is 20% of what the customer pays and 25% on top of costs/)).toBeVisible();

  // Put it back, so nothing else depends on this test.
  await admin.locator('select[name="pricingMode"]').selectOption("time");
  await save("back to time pricing");
  await L(admin, "Road distance, one way (km)").first().fill("9");
  await expect(v(admin, "Rs 1,325").first()).toBeVisible();

  // A mistake is refused, not saved.
  await L(admin, "Ally fee (%)").fill("250");
  await L(admin, "Why are you changing the rates?").fill("typo");
  await admin.getByRole("button", { name: "Save as a new version" }).click();
  await expect(admin.getByRole("status").filter({ hasText: /./ }).last()).toBeVisible();
  await expect(v(admin, "Saved as a new version. Old prices keep the rates they used.")).toHaveCount(0);
});

test("a customer cannot open the pricing page", async ({ page }) => {
  await signInOwner(page, "priya");
  await page.goto("/ops/pricing");
  await expect(page).not.toHaveURL(/\/ops/);
});
