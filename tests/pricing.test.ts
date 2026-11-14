import { describe, expect, it } from "vitest";
import {
  calculatePrice, convertInr, currencyForCountry, DEFAULT_RATE_CARD, formatMoney, isInServiceArea, mapsRouteLink, missingDetails, quoteParts, rateCardSchema,
  readDetails, roadKm, straightLineKm, withDefaults, customerNotes, type PriceInput, type RateCard,
} from "@/lib/pricing-rules";

const COST: RateCard = { ...DEFAULT_RATE_CARD, pricingMode: "cost" };
const calc = (i: PriceInput, card: RateCard = COST) => calculatePrice(i, card);
const base: PriceInput = {
  service: "delivery", distanceKm: 10, returnTrip: false, extraStops: 0, waitMinutes: 0, urgency: "standard", whenLocal: "", sizeClass: "small", weightKg: 2,
  heavyRain: false, thirdPartyInr: 0, declaredValueInr: 0, prohibitedItem: false,
};
const sum = (r: ReturnType<typeof calculatePrice>) => r.lines.reduce((n, l) => n + l.paise, 0);

describe("the price of a trip", () => {
  it("works out a plain 10 km trip by hand: rider, EV, a 25% fee, and a total of Rs 160", () => {
    const r = calc(base);
    expect(r.riderPaise).toBe(11000); // Rs 30 + 10 km at Rs 8
    expect(r.evPaise).toBe(1800); // 10 km at Rs 1.20, plus Rs 6 per task
    expect(r.costsPaise).toBe(12800);
    expect(r.allyFeePaise).toBe(3200); // 25% of costs
    expect(r.totalPaise).toBe(16000);
    expect(r.feeShareOfTotalPct).toBe(20); // 25% on costs is 20% of what the customer pays
    expect(r.ok).toBe(true);
  });
  it("the lines always add up to the total, to the paisa", () => {
    for (const d of [1, 3.7, 9.9, 18.3, 34.9]) for (const urgency of ["scheduled", "standard", "priority", "express"] as const) {
      const r = calc({ ...base, distanceKm: d, urgency, thirdPartyInr: 333.33, waitMinutes: 47, extraStops: 2, whenLocal: "2026-11-15T22:10" });
      expect(sum(r), `${d} ${urgency}`).toBe(r.totalPaise);
    }
  });
  it("can take the fee as a share of the price instead, so 25% means 25% of what the customer pays", () => {
    const r = calc(base, { ...COST, feeBasis: "of_total", roundToInr: 1 });
    expect(r.allyFeePaise).toBe(4267); // 12800 x 25 / 75
    expect(Math.abs(r.feeShareOfTotalPct - 25)).toBeLessThan(0.2);
  });
  it("charges more for speed, and says so on its own line", () => {
    const standard = calc(base);
    const express = calc({ ...base, urgency: "express" });
    expect(express.totalPaise).toBeGreaterThan(standard.totalPaise);
    expect(express.lines.some((l) => l.key === "rider_urgency")).toBe(true);
    expect(calc({ ...base, urgency: "scheduled" }).totalPaise).toBe(standard.totalPaise);
  });
  it("adds a night extra across midnight, and a Sunday extra, only when a time is given", () => {
    expect(calc({ ...base, whenLocal: "2026-11-14T23:30" }).lines.some((l) => l.key === "rider_night")).toBe(true);
    expect(calc({ ...base, whenLocal: "2026-11-14T03:00" }).lines.some((l) => l.key === "rider_night")).toBe(true);
    expect(calc({ ...base, whenLocal: "2026-11-14T12:00" }).lines.some((l) => l.key === "rider_night")).toBe(false);
    expect(calc({ ...base, whenLocal: "2026-11-15T12:00" }).lines.some((l) => l.key === "rider_sunday")).toBe(true); // 15 Nov 2026 is a Sunday
    expect(calc({ ...base, whenLocal: "2026-11-14T12:00" }).lines.some((l) => l.key === "rider_sunday")).toBe(false);
    expect(calc(base).assumptions.join(" ")).toMatch(/No time was given/);
  });
  it("ignores a time that is not real, and says so", () => {
    const r = calc({ ...base, whenLocal: "2026-02-31T10:00" });
    expect(r.warnings.join(" ")).toMatch(/time was not understood/);
    expect(r.lines.some((l) => l.key === "rider_night" || l.key === "rider_sunday")).toBe(false);
  });
  it("doubles the distance for a return trip", () => {
    expect(calc({ ...base, returnTrip: true }).routeKm).toBe(20);
  });
  it("charges for waiting only after the free minutes", () => {
    expect(calc({ ...base, waitMinutes: 10 }).lines.some((l) => l.key === "rider_wait")).toBe(false);
    expect(calc({ ...base, waitMinutes: 40 }).lines.find((l) => l.key === "rider_wait")?.paise).toBe(6000); // 30 min x Rs 2
  });
  it("passes a provider's cost through at cost, and takes the fee on it", () => {
    const r = calc({ ...base, service: "errand", distanceKm: 0, thirdPartyInr: 800, thirdPartyNote: "Plumber visit" });
    expect(r.thirdPartyPaise).toBe(80000);
    expect(r.allyFeePaise).toBeGreaterThanOrEqual(Math.round(80000 * 0.25));
    expect(r.ok).toBe(true);
  });
  it("applies the minimum fee and the minimum charge", () => {
    const tiny = calc({ ...base, distanceKm: 0.5 });
    expect(tiny.totalPaise).toBeGreaterThanOrEqual(9900);
    const noMins = calc({ ...base, distanceKm: 0.5 }, { ...COST, minTotalInr: 0, minFeeInr: 0, roundToInr: 1 });
    expect(noMins.totalPaise).toBeLessThan(tiny.totalPaise);
  });
  it("rounds the total up, never down, to the card's step", () => {
    for (const d of [2.2, 4.4, 6.1, 11.3]) expect(calc({ ...base, distanceKm: d }).totalPaise % 500).toBe(0);
  });
  it("adds tax only at the rate the accountant set, on the basis chosen", () => {
    expect(calc(base).taxPaise).toBe(0);
    const onFee = calc(base, { ...COST, taxPct: 18, roundToInr: 1 });
    expect(onFee.taxPaise).toBe(Math.round(3200 * 0.18));
    const onAll = calc(base, { ...COST, taxPct: 18, taxBasis: "all", roundToInr: 1 });
    expect(onAll.taxPaise).toBe(Math.round((12800 + 3200) * 0.18));
  });
});

describe("when we must say no, or ask", () => {
  const blocked = (over: Partial<PriceInput>) => calc({ ...base, ...over });
  it("will not price a trip with no distance", () => expect(blocked({ distanceKm: 0 }).blockers.join(" ")).toMatch(/Add the distance/));
  it("does not need a distance for an errand with a provider", () => expect(blocked({ service: "errand", distanceKm: 0, thirdPartyInr: 500 }).blockers).toEqual([]));
  it("refuses a route longer than an EV can do", () => expect(blocked({ distanceKm: 60 }).ok).toBe(false));
  it("refuses a load too heavy for a scooter", () => expect(blocked({ weightKg: 40 }).blockers.join(" ")).toMatch(/kg/));
  it("refuses things we do not carry", () => expect(blocked({ prohibitedItem: true }).ok).toBe(false));
  it("refuses anything outside Mumbai, by PIN code", () => {
    expect(blocked({ pickupPincode: "400601" }).blockers.join(" ")).toMatch(/outside Mumbai/); // Thane
    expect(blocked({ dropPincode: "411001" }).ok).toBe(false); // Pune
    expect(blocked({ pickupPincode: "400050", dropPincode: "400076" }).ok).toBe(true); // Bandra, Powai
  });
  it("treats negative and broken numbers as a stop, not a price", () => {
    expect(blocked({ distanceKm: -5 }).ok).toBe(false);
    expect(blocked({ thirdPartyInr: Number.NaN }).ok).toBe(false);
    expect(blocked({ waitMinutes: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });
  it("warns, without stopping, on high value, large items and an unexplained provider cost", () => {
    const r = blocked({ declaredValueInr: 50000, sizeClass: "large", thirdPartyInr: 100 });
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThanOrEqual(3);
  });
  it("knows the service area edges", () => {
    expect(isInServiceArea("400001", DEFAULT_RATE_CARD)).toBe(true);
    expect(isInServiceArea("400104", DEFAULT_RATE_CARD)).toBe(true);
    expect(isInServiceArea("400105", DEFAULT_RATE_CARD)).toBe(false);
    expect(isInServiceArea("39999", DEFAULT_RATE_CARD)).toBeNull();
  });
});

describe("asking the customer for what is missing", () => {
  it("asks for everything on an empty delivery", () => {
    const ask = missingDetails(readDetails({ service: "delivery" })).join(" ");
    for (const w of ["pickup", "drop-off", "PIN code", "phone number", "day", "time window", "What is being picked up", "heavy", "worth"]) expect(ask).toContain(w);
  });
  it("asks for nothing once it has it all", () => {
    const place = { address: "12 Hill Road", area: "Bandra West", pincode: "400050", contactName: "Asha", contactPhone: "+919800000000", access: "" };
    const d = readDetails({ service: "delivery", pickup: place, drop: { ...place, pincode: "400076" }, window: { date: "2026-11-16", from: "10:00", to: "13:00" }, item: { what: "Passport file", weightKg: 1, valueInr: 500 } });
    expect(missingDetails(d)).toEqual([]);
  });
  it("says plainly when an address is outside Mumbai", () => {
    expect(missingDetails(readDetails({ service: "visit", pickup: { pincode: "411001" } })).join(" ")).toMatch(/outside Mumbai/);
  });
  it("reads old requests that have no details, and rejects rubbish quietly", () => {
    expect(readDetails(null).service).toBe("visit");
    expect(readDetails({ urgency: "teleport" }).urgency).toBe("standard");
    expect(readDetails("text").pickup.address).toBe("");
  });
});

describe("the rate card", () => {
  it("accepts the starting card and rejects mistakes", () => {
    expect(rateCardSchema.safeParse(DEFAULT_RATE_CARD).success).toBe(true);
    expect(rateCardSchema.safeParse({ ...COST, feePct: 150 }).success).toBe(false);
    expect(rateCardSchema.safeParse({ ...COST, riderPerKmInr: -1 }).success).toBe(false);
    expect(rateCardSchema.safeParse({ ...COST, urgencyMultiplier: { ...COST.urgencyMultiplier, express: 0.5 } }).success).toBe(false);
    expect(rateCardSchema.safeParse({ ...COST, areaPinFrom: 400200, areaPinTo: 400100 }).success).toBe(false);
  });
  it("fills in rates an older saved card does not have", () => {
    const old = withDefaults({ riderBaseInr: 45 });
    expect(old.riderBaseInr).toBe(45);
    expect(old.feePct).toBe(25);
    expect(withDefaults(null)).toEqual(DEFAULT_RATE_CARD);
  });
});

describe("quotation parts", () => {
  it("split the price into the three quotation fields and add up exactly", () => {
    for (const d of [2, 7.5, 19]) {
      const r = calc({ ...base, distanceKm: d, thirdPartyInr: 250, whenLocal: "2026-11-15T09:00" }, { ...COST, taxPct: 18 });
      const q = quoteParts(r);
      expect(q.providerFeeInr + q.coordinationFeeInr + q.taxesInr).toBe(q.totalInr);
      expect(q.totalInr).toBe(Math.round(r.totalPaise / 100));
      expect(q.coordinationFeeInr).toBeGreaterThan(0);
    }
  });
});

describe("distance and maps", () => {
  it("measures Bandra to Powai as a few km in a straight line, and longer by road", () => {
    const s = straightLineKm({ lat: 19.0596, lng: 72.8295 }, { lat: 19.1176, lng: 72.906 });
    expect(s).toBeGreaterThan(8);
    expect(s).toBeLessThan(13);
    expect(roadKm(s, 1.3)).toBeGreaterThan(s);
  });
  it("builds a Maps link that keeps the places in Mumbai and sends no key", () => {
    const u = mapsRouteLink("Bandra West", "Powai");
    expect(u).toContain("google.com/maps/dir");
    expect(decodeURIComponent(u)).toContain("Powai, Mumbai");
    expect(u).not.toMatch(/key=/);
  });
});

describe("currency", () => {
  it("picks the customer's currency from their country, and shows rupees only when unsure", () => {
    expect(currencyForCountry("United Kingdom")).toBe("GBP");
    expect(currencyForCountry(" canada ")).toBe("CAD");
    expect(currencyForCountry("Germany")).toBe("EUR");
    expect(currencyForCountry("Atlantis")).toBeNull();
    expect(currencyForCountry(null)).toBeNull();
  });
  it("converts at a stated rate, with any buffer added openly", () => {
    expect(convertInr(1000, 0.0106)).toBe(10.6);
    expect(convertInr(1000, 0.0106, 2)).toBe(10.81);
    expect(convertInr(1000, 0)).toBe(0);
    expect(convertInr(-5, 0.01)).toBe(0);
  });
  it("formats money for each currency", () => {
    expect(formatMoney(10.6, "USD")).toBe("$10.60");
    expect(formatMoney(8, "XXX")).toBeTruthy();
  });
});

describe("from a request to the calculator", () => {
  it("fills the calculator from what the customer told us", async () => {
    const { inputFromDetails } = await import("@/lib/pricing-rules");
    const d = readDetails({ service: "delivery", urgency: "priority", pickup: { pincode: "400050" }, drop: { pincode: "400076" }, window: { date: "2026-11-16", from: "10:00", to: "13:00" }, item: { size: "medium", weightKg: 4, valueInr: 1500 }, returnTrip: true });
    const i = inputFromDetails(d);
    expect(i).toMatchObject({ service: "delivery", urgency: "priority", whenLocal: "2026-11-16T10:00", sizeClass: "medium", weightKg: 4, declaredValueInr: 1500, pickupPincode: "400050", dropPincode: "400076", returnTrip: true });
  });
  it("writes a short note for the customer that names no internal costs", async () => {
    const { customerNotes } = await import("@/lib/pricing-rules");
    const note = customerNotes({ service: "delivery", urgency: "standard", returnTrip: false }, { routeKm: 12 }, "Bandra West", "Powai");
    expect(note).toContain("Bandra West to Powai");
    expect(note).toContain("12 km");
    expect(note).toContain("Paid in full before the work starts");
    expect(note).not.toMatch(/rider|fee|margin|%/i);
    expect(note).not.toContain("\u2014");
  });
});


describe("time pricing: the customer pays for time, in half hours, in US dollars", () => {
  const usd = 0.0106; // US dollars one rupee buys
  const TIME: RateCard = { ...DEFAULT_RATE_CARD, pricingMode: "time" };
  const t = (over: Partial<PriceInput> = {}, card: RateCard = TIME) => calculatePrice({ ...base, usdPerInr: usd, ...over }, card);
  const sumLines = (r: ReturnType<typeof calculatePrice>) => r.lines.reduce((n, l) => n + l.paise, 0);

  it("is the default way of pricing", () => expect(DEFAULT_RATE_CARD.pricingMode).toBe("time"));
  it("works a 9 km delivery out by hand: 46 minutes is two half hours, so 14 dollars of time, Rs 1,325 in rupees", () => {
    const r = t({ distanceKm: 9 });
    expect(r.time).toMatchObject({ travelMin: 30, handlingMin: 16, workMin: 0, waitMin: 0, totalMin: 46, blocks: 2, blockUsd: 7 });
    expect(r.time!.blockPaise).toBe(66038); // 7 dollars at 0.0106 is Rs 660.38
    expect(r.riderPaise).toBe(10200);
    expect(r.evPaise).toBe(1680);
    expect(r.allyFeePaise).toBe(132076 - 10200 - 1680); // the time charge left after the rider and the vehicle; the Rs 4.24 round-up is its own line
    expect(r.totalPaise).toBe(132500);
    expect(r.totalUsd).toBeCloseTo(14.05, 1);
    expect(r.fair?.floorApplied).toBe(false);
    expect(r.ok).toBe(true);
  });
  it("adds the customer's own time at the place, and any waiting, to the clock", () => {
    const quick = t({ distanceKm: 4, workMinutes: 0 });
    const long = t({ distanceKm: 4, workMinutes: 60, waitMinutes: 20 });
    expect(long.time!.workMin).toBe(60);
    expect(long.time!.waitMin).toBe(20);
    expect(long.totalPaise).toBeGreaterThan(quick.totalPaise);
  });
  it("counts travel from distance and speed, doubles it for there and back, and lets the desk overrule it", () => {
    expect(t({ distanceKm: 9, returnTrip: true }).time!.travelMin).toBe(60);
    const set = t({ distanceKm: 9, travelMinutesOverride: 10 });
    expect(set.time!.travelMin).toBe(10);
    expect(set.warnings.join(" ")).toMatch(/set by hand/);
  });
  it("never charges less for more time", () => {
    let last = 0;
    for (const m of [0, 5, 15, 30, 31, 61, 90, 150, 240]) {
      const r = t({ distanceKm: 3, workMinutes: m });
      expect(r.totalPaise, `${m} min`).toBeGreaterThanOrEqual(last);
      last = r.totalPaise;
    }
  });
  it("bills a part of a half hour as a whole one, with a minimum of one", () => {
    expect(t({ distanceKm: 0.1, service: "visit", workMinutes: 0 }).time!.blocks).toBe(1);
    const a = t({ service: "visit", distanceKm: 1, workMinutes: 6 }); // 3 travel + 8 handling + 6 work = 17
    expect(a.time!.totalMin).toBe(17);
    expect(a.time!.blocks).toBe(1);
    expect(t({ service: "visit", distanceKm: 1, workMinutes: 20 }).time!.blocks).toBe(2); // 31 minutes
  });
  it("charges more for speed and for night and Sunday, on the time itself", () => {
    const plain = t({ distanceKm: 9 });
    expect(t({ distanceKm: 9, urgency: "express" }).totalPaise).toBeGreaterThan(plain.totalPaise);
    expect(t({ distanceKm: 9, whenLocal: "2026-11-14T23:00" }).timeLines!.some((l) => l.key === "time_night")).toBe(true);
    expect(t({ distanceKm: 9, whenLocal: "2026-11-15T12:00" }).timeLines!.some((l) => l.key === "time_sunday")).toBe(true);
  });
  it("is raised to the floor when the time price would not cover the rider, the vehicle and our 25% fee, and says so", () => {
    const cheap = t({ distanceKm: 9 }, { ...TIME, timeBlockUsd: 0.5 });
    expect(cheap.fair?.floorApplied).toBe(true);
    expect(cheap.lines.find((l) => l.key === "ally_service")!.paise).toBe(Math.round(11880 * 0.25));
    expect(cheap.totalPaise).toBe(15000); // Rs 148.50 rounded up to Rs 150
    expect(cheap.warnings.join(" ")).toMatch(/raised to the floor/);
    const loose = t({ distanceKm: 9 }, { ...TIME, timeBlockUsd: 0.5, applyCostFloor: false });
    expect(loose.fair?.floorApplied).toBe(false);
    expect(loose.warnings.join(" ")).toMatch(/lose money/);
  });
  it("warns when the time price is far above the costs, so a wrong time guess is caught", () => {
    expect(t({ distanceKm: 9, workMinutes: 460 }).warnings.join(" ")).toMatch(/more than 8 hours/);
    expect(t({ distanceKm: 9 }, { ...TIME, timeBlockUsd: 60 }).warnings.join(" ")).toMatch(/times our costs/);
  });
  it("cannot price without today's dollar rate, and says where to get it", () => {
    const r = calculatePrice({ ...base, distanceKm: 9 }, TIME);
    expect(r.ok).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/dollar rate/);
  });
  it("keeps a provider's cost at cost, with the 25% fee on it, and tax on top as set", () => {
    const r = t({ service: "errand", distanceKm: 0, thirdPartyInr: 800, thirdPartyNote: "Plumber", workMinutes: 30 }, { ...TIME, taxPct: 18, roundToInr: 1 });
    expect(r.thirdPartyPaise).toBe(80000);
    expect(r.lines.find((l) => l.key === "ally_third_fee")!.paise).toBe(20000);
    expect(r.taxPaise).toBe(Math.round(r.allyFeePaise * 0.18));
    expect(sumLines(r)).toBe(r.totalPaise);
  });
  it("the lines add up to the total, and the time lines add up to the service price, to the paisa", () => {
    for (const d of [1, 3.7, 9.9, 18.3, 34.9]) for (const urgency of ["scheduled", "priority", "express"] as const) for (const w of [0, 25, 95]) {
      const r = t({ distanceKm: d, urgency, workMinutes: w, thirdPartyInr: 333.33, extraStops: 1, whenLocal: "2026-11-15T22:10" });
      expect(sumLines(r), `${d} ${urgency} ${w}`).toBe(r.totalPaise);
      const service = r.timeLines!.reduce((n, l) => n + l.paise, 0);
      expect(service, `${d} ${urgency} ${w}`).toBe(r.riderPaise + r.evPaise + r.lines.find((l) => l.key === "ally_service")!.paise);
    }
  });
  it("shows the price in both dollars and rupees, and the split into quotation parts still adds up", () => {
    const r = t({ distanceKm: 9, thirdPartyInr: 250 });
    expect(r.totalUsd).toBeGreaterThan(0);
    expect(Math.abs(r.totalUsd! - (r.totalPaise / 100) * usd)).toBeLessThan(0.02);
    const q = quoteParts(r);
    expect(q.providerFeeInr + q.coordinationFeeInr + q.taxesInr).toBe(q.totalInr);
  });
  it("keeps the old cost-plus way available as a setting", () => {
    expect(calculatePrice({ ...base }, COST).totalPaise).toBe(16000);
    expect(calculatePrice({ ...base }, COST).mode).toBe("cost");
  });
  it("asks the customer how long the work will take, for a visit or an errand", () => {
    expect(missingDetails(readDetails({ service: "visit" })).join(" ")).toMatch(/how long the work will take/);
    expect(missingDetails(readDetails({ service: "visit", workMinutes: 30 })).join(" ")).not.toMatch(/how long/);
    expect(missingDetails(readDetails({ service: "delivery" })).join(" ")).not.toMatch(/how long the work/);
  });
  it("tells the customer the time in plain words and no internal costs", () => {
    const r = t({ distanceKm: 9 });
    const note = customerNotes({ service: "delivery", urgency: "standard", returnTrip: false }, r, "Bandra West", "Powai");
    expect(note).toMatch(/About 46 minutes in all/);
    expect(note).toMatch(/2 half-hours/);
    expect(note).not.toMatch(/rider|fee|margin|%/i);
  });
});
