import { describe, expect, it } from "vitest";
import {
  calculatePrice, convertInr, currencyForCountry, DEFAULT_RATE_CARD, formatMoney, isInServiceArea, mapsRouteLink, missingDetails, quoteParts, rateCardSchema,
  readDetails, roadKm, straightLineKm, withDefaults, type PriceInput,
} from "@/lib/pricing-rules";

const base: PriceInput = {
  service: "delivery", distanceKm: 10, returnTrip: false, extraStops: 0, waitMinutes: 0, urgency: "standard", whenLocal: "", sizeClass: "small", weightKg: 2,
  heavyRain: false, thirdPartyInr: 0, declaredValueInr: 0, prohibitedItem: false,
};
const sum = (r: ReturnType<typeof calculatePrice>) => r.lines.reduce((n, l) => n + l.paise, 0);

describe("the price of a trip", () => {
  it("works out a plain 10 km trip by hand: rider, EV, a 25% fee, and a total of Rs 160", () => {
    const r = calculatePrice(base);
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
      const r = calculatePrice({ ...base, distanceKm: d, urgency, thirdPartyInr: 333.33, waitMinutes: 47, extraStops: 2, whenLocal: "2026-11-15T22:10" });
      expect(sum(r), `${d} ${urgency}`).toBe(r.totalPaise);
    }
  });
  it("can take the fee as a share of the price instead, so 25% means 25% of what the customer pays", () => {
    const r = calculatePrice(base, { ...DEFAULT_RATE_CARD, feeBasis: "of_total", roundToInr: 1 });
    expect(r.allyFeePaise).toBe(4267); // 12800 x 25 / 75
    expect(Math.abs(r.feeShareOfTotalPct - 25)).toBeLessThan(0.2);
  });
  it("charges more for speed, and says so on its own line", () => {
    const standard = calculatePrice(base);
    const express = calculatePrice({ ...base, urgency: "express" });
    expect(express.totalPaise).toBeGreaterThan(standard.totalPaise);
    expect(express.lines.some((l) => l.key === "rider_urgency")).toBe(true);
    expect(calculatePrice({ ...base, urgency: "scheduled" }).totalPaise).toBe(standard.totalPaise);
  });
  it("adds a night extra across midnight, and a Sunday extra, only when a time is given", () => {
    expect(calculatePrice({ ...base, whenLocal: "2026-11-14T23:30" }).lines.some((l) => l.key === "rider_night")).toBe(true);
    expect(calculatePrice({ ...base, whenLocal: "2026-11-14T03:00" }).lines.some((l) => l.key === "rider_night")).toBe(true);
    expect(calculatePrice({ ...base, whenLocal: "2026-11-14T12:00" }).lines.some((l) => l.key === "rider_night")).toBe(false);
    expect(calculatePrice({ ...base, whenLocal: "2026-11-15T12:00" }).lines.some((l) => l.key === "rider_sunday")).toBe(true); // 15 Nov 2026 is a Sunday
    expect(calculatePrice({ ...base, whenLocal: "2026-11-14T12:00" }).lines.some((l) => l.key === "rider_sunday")).toBe(false);
    expect(calculatePrice(base).assumptions.join(" ")).toMatch(/No time was given/);
  });
  it("ignores a time that is not real, and says so", () => {
    const r = calculatePrice({ ...base, whenLocal: "2026-02-31T10:00" });
    expect(r.warnings.join(" ")).toMatch(/time was not understood/);
    expect(r.lines.some((l) => l.key === "rider_night" || l.key === "rider_sunday")).toBe(false);
  });
  it("doubles the distance for a return trip", () => {
    expect(calculatePrice({ ...base, returnTrip: true }).routeKm).toBe(20);
  });
  it("charges for waiting only after the free minutes", () => {
    expect(calculatePrice({ ...base, waitMinutes: 10 }).lines.some((l) => l.key === "rider_wait")).toBe(false);
    expect(calculatePrice({ ...base, waitMinutes: 40 }).lines.find((l) => l.key === "rider_wait")?.paise).toBe(6000); // 30 min x Rs 2
  });
  it("passes a provider's cost through at cost, and takes the fee on it", () => {
    const r = calculatePrice({ ...base, service: "errand", distanceKm: 0, thirdPartyInr: 800, thirdPartyNote: "Plumber visit" });
    expect(r.thirdPartyPaise).toBe(80000);
    expect(r.allyFeePaise).toBeGreaterThanOrEqual(Math.round(80000 * 0.25));
    expect(r.ok).toBe(true);
  });
  it("applies the minimum fee and the minimum charge", () => {
    const tiny = calculatePrice({ ...base, distanceKm: 0.5 });
    expect(tiny.totalPaise).toBeGreaterThanOrEqual(9900);
    const noMins = calculatePrice({ ...base, distanceKm: 0.5 }, { ...DEFAULT_RATE_CARD, minTotalInr: 0, minFeeInr: 0, roundToInr: 1 });
    expect(noMins.totalPaise).toBeLessThan(tiny.totalPaise);
  });
  it("rounds the total up, never down, to the card's step", () => {
    for (const d of [2.2, 4.4, 6.1, 11.3]) expect(calculatePrice({ ...base, distanceKm: d }).totalPaise % 500).toBe(0);
  });
  it("adds tax only at the rate the accountant set, on the basis chosen", () => {
    expect(calculatePrice(base).taxPaise).toBe(0);
    const onFee = calculatePrice(base, { ...DEFAULT_RATE_CARD, taxPct: 18, roundToInr: 1 });
    expect(onFee.taxPaise).toBe(Math.round(3200 * 0.18));
    const onAll = calculatePrice(base, { ...DEFAULT_RATE_CARD, taxPct: 18, taxBasis: "all", roundToInr: 1 });
    expect(onAll.taxPaise).toBe(Math.round((12800 + 3200) * 0.18));
  });
});

describe("when we must say no, or ask", () => {
  const blocked = (over: Partial<PriceInput>) => calculatePrice({ ...base, ...over });
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
    expect(rateCardSchema.safeParse({ ...DEFAULT_RATE_CARD, feePct: 150 }).success).toBe(false);
    expect(rateCardSchema.safeParse({ ...DEFAULT_RATE_CARD, riderPerKmInr: -1 }).success).toBe(false);
    expect(rateCardSchema.safeParse({ ...DEFAULT_RATE_CARD, urgencyMultiplier: { ...DEFAULT_RATE_CARD.urgencyMultiplier, express: 0.5 } }).success).toBe(false);
    expect(rateCardSchema.safeParse({ ...DEFAULT_RATE_CARD, areaPinFrom: 400200, areaPinTo: 400100 }).success).toBe(false);
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
      const r = calculatePrice({ ...base, distanceKm: d, thirdPartyInr: 250, whenLocal: "2026-11-15T09:00" }, { ...DEFAULT_RATE_CARD, taxPct: 18 });
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
