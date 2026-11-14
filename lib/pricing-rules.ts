import { z } from "zod";

/**
 * Pricing for work done in Mumbai on electric vehicles.
 * Pure functions only: nothing here reads a database or the clock, so every number can be tested.
 * Money is worked out in paise (whole numbers) so lines always add up to the total, to the paisa.
 */

export const URGENCIES = ["scheduled", "standard", "priority", "express"] as const;
export type Urgency = (typeof URGENCIES)[number];
export const URGENCY_LABEL: Record<Urgency, string> = {
  scheduled: "Within the next 2 days",
  standard: "Today",
  priority: "In the next few hours",
  express: "As soon as possible",
};

export const SIZES = ["envelope", "small", "medium", "large"] as const;
export type SizeClass = (typeof SIZES)[number];
export const SIZE_LABEL: Record<SizeClass, string> = {
  envelope: "Documents or an envelope",
  small: "Fits in a small bag",
  medium: "Fits in a backpack or a box",
  large: "Large or awkward",
};

export const SERVICES = ["delivery", "visit", "errand"] as const;
export type Service = (typeof SERVICES)[number];
export const SERVICE_LABEL: Record<Service, string> = {
  delivery: "Pick up and drop",
  visit: "Go to one place (visit, check, collect a signature)",
  errand: "Arrange something with a provider",
};

// ---------- The rate card ----------

export interface RateCard {
  riderBaseInr: number;
  riderPerKmInr: number;
  freeWaitMinutes: number;
  riderWaitPerMinInr: number;
  extraStopInr: number;
  urgencyMultiplier: Record<Urgency, number>;
  nightUpliftPct: number;
  nightFromHour: number;
  nightToHour: number;
  sundayUpliftPct: number;
  heavyRainBonusInr: number;
  sizeSurchargeInr: Record<SizeClass, number>;
  evEnergyPerKmInr: number;
  evMaintenancePerKmInr: number;
  evPerTaskOverheadInr: number;
  feePct: number;
  feeBasis: "on_costs" | "of_total";
  minFeeInr: number;
  taxPct: number;
  taxBasis: "ally_fee" | "all";
  minTotalInr: number;
  roundToInr: number;
  evMaxRouteKm: number;
  evMaxWeightKg: number;
  highValueInr: number;
  roadFactor: number;
  areaPinFrom: number;
  areaPinTo: number;
  fxBufferPct: number;
  quoteValidHours: number;
}

/**
 * Starting values so the calculator works on day one. They are assumptions, not market rates.
 * Replace them with what real trips cost. The desk edits them on the Pricing page.
 */
export const DEFAULT_RATE_CARD: RateCard = {
  riderBaseInr: 30,
  riderPerKmInr: 8,
  freeWaitMinutes: 10,
  riderWaitPerMinInr: 2,
  extraStopInr: 25,
  urgencyMultiplier: { scheduled: 1, standard: 1, priority: 1.35, express: 1.8 },
  nightUpliftPct: 25,
  nightFromHour: 21,
  nightToHour: 6,
  sundayUpliftPct: 15,
  heavyRainBonusInr: 30,
  sizeSurchargeInr: { envelope: 0, small: 0, medium: 15, large: 40 },
  evEnergyPerKmInr: 0.5,
  evMaintenancePerKmInr: 0.7,
  evPerTaskOverheadInr: 6,
  feePct: 25,
  feeBasis: "on_costs",
  minFeeInr: 25,
  taxPct: 0,
  taxBasis: "ally_fee",
  minTotalInr: 99,
  roundToInr: 5,
  evMaxRouteKm: 35,
  evMaxWeightKg: 15,
  highValueInr: 20000,
  roadFactor: 1.3,
  areaPinFrom: 400001,
  areaPinTo: 400104,
  fxBufferPct: 0,
  quoteValidHours: 48,
};

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const byUrgency = (min: number, max: number) => z.object({ scheduled: num(min, max), standard: num(min, max), priority: num(min, max), express: num(min, max) });
const bySize = (min: number, max: number) => z.object({ envelope: num(min, max), small: num(min, max), medium: num(min, max), large: num(min, max) });

/** Checked again on the server before a rate card is saved, so a typo cannot reach a customer's price. */
export const rateCardSchema = z.object({
  riderBaseInr: num(0, 5000),
  riderPerKmInr: num(0, 500),
  freeWaitMinutes: num(0, 240),
  riderWaitPerMinInr: num(0, 100),
  extraStopInr: num(0, 2000),
  urgencyMultiplier: byUrgency(1, 5),
  nightUpliftPct: num(0, 200),
  nightFromHour: z.number().int().min(0).max(23),
  nightToHour: z.number().int().min(0).max(23),
  sundayUpliftPct: num(0, 200),
  heavyRainBonusInr: num(0, 2000),
  sizeSurchargeInr: bySize(0, 5000),
  evEnergyPerKmInr: num(0, 50),
  evMaintenancePerKmInr: num(0, 50),
  evPerTaskOverheadInr: num(0, 1000),
  feePct: num(0, 90),
  feeBasis: z.enum(["on_costs", "of_total"]),
  minFeeInr: num(0, 10000),
  taxPct: num(0, 50),
  taxBasis: z.enum(["ally_fee", "all"]),
  minTotalInr: num(0, 100000),
  roundToInr: z.number().int().min(1).max(100),
  evMaxRouteKm: num(1, 200),
  evMaxWeightKg: num(0.1, 500),
  highValueInr: num(0, 100000000),
  roadFactor: num(1, 3),
  areaPinFrom: z.number().int().min(100000).max(999999),
  areaPinTo: z.number().int().min(100000).max(999999),
  fxBufferPct: num(0, 10),
  quoteValidHours: num(1, 720),
}).refine((c) => c.areaPinFrom <= c.areaPinTo, { message: "The first PIN code must not be after the last.", path: ["areaPinTo"] });

/** Fills in anything missing from an older saved card, so adding a new rate never breaks old data. */
export function withDefaults(saved: unknown): RateCard {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<RateCard>;
  return { ...DEFAULT_RATE_CARD, ...s, urgencyMultiplier: { ...DEFAULT_RATE_CARD.urgencyMultiplier, ...(s.urgencyMultiplier ?? {}) }, sizeSurchargeInr: { ...DEFAULT_RATE_CARD.sizeSurchargeInr, ...(s.sizeSurchargeInr ?? {}) } };
}

// ---------- Where and when: what the customer tells us ----------

const text = (n: number) => z.string().trim().max(n).default("");
const place = z.object({
  address: text(300), area: text(80), pincode: z.string().trim().regex(/^(\d{6})?$/, "A PIN code has 6 digits.").default(""),
  contactName: text(80), contactPhone: text(30), access: text(200),
});
export type Place = z.infer<typeof place>;

export const requestDetailsSchema = z.object({
  service: z.enum(SERVICES).default("visit"),
  urgency: z.enum(URGENCIES).default("standard"),
  pickup: place.default({ address: "", area: "", pincode: "", contactName: "", contactPhone: "", access: "" }),
  drop: place.default({ address: "", area: "", pincode: "", contactName: "", contactPhone: "", access: "" }),
  window: z.object({ date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""), from: z.string().regex(/^(\d{2}:\d{2})?$/).default(""), to: z.string().regex(/^(\d{2}:\d{2})?$/).default("") }).default({ date: "", from: "", to: "" }),
  item: z.object({ what: text(200), size: z.enum(SIZES).default("small"), weightKg: z.number().finite().min(0).max(500).default(0), valueInr: z.number().finite().min(0).max(100000000).default(0), fragile: z.boolean().default(false) }).default({ what: "", size: "small", weightKg: 0, valueInr: 0, fragile: false }),
  returnTrip: z.boolean().default(false),
  waitMinutes: z.number().finite().min(0).max(600).default(0),
  notes: text(500),
});
export type RequestDetails = z.infer<typeof requestDetailsSchema>;

/** Reads whatever is stored on a request, tolerating old requests that have nothing. */
export function readDetails(raw: unknown): RequestDetails {
  const p = requestDetailsSchema.safeParse(raw && typeof raw === "object" ? raw : {});
  return p.success ? p.data : requestDetailsSchema.parse({});
}

export function isInServiceArea(pincode: string, card: Pick<RateCard, "areaPinFrom" | "areaPinTo">): boolean | null {
  if (!/^\d{6}$/.test(pincode)) return null; // unknown, not a no
  const n = Number(pincode);
  return n >= card.areaPinFrom && n <= card.areaPinTo;
}

/** Everything we still need to ask the customer. Written as questions, in plain words. */
export function missingDetails(d: RequestDetails, card: Pick<RateCard, "areaPinFrom" | "areaPinTo"> = DEFAULT_RATE_CARD): string[] {
  const ask: string[] = [];
  const hasDrop = d.service === "delivery";
  const where = (p: Place, name: string) => {
    if (!p.address && !p.area) ask.push(`The address or area for the ${name}.`);
    if (!p.pincode) ask.push(`The PIN code for the ${name}.`);
    else if (isInServiceArea(p.pincode, card) === false) ask.push(`The ${name} PIN code is outside Mumbai. We only work in Mumbai for now.`);
    if (!p.contactName || !p.contactPhone) ask.push(`A name and phone number of someone at the ${name}.`);
  };
  where(d.pickup, d.service === "delivery" ? "pickup" : "place we should go to");
  if (hasDrop) where(d.drop, "drop-off");
  if (!d.window.date) ask.push("The day it should be done.");
  if (!d.window.from || !d.window.to) ask.push("A time window that suits you, with the earliest and latest time.");
  if (d.service === "delivery" || d.item.what) {
    if (!d.item.what) ask.push("What is being picked up, in a few words.");
    if (!d.item.weightKg) ask.push("About how heavy it is, in kilograms.");
  }
  if (d.service === "delivery" && !d.item.valueInr) ask.push("What it is worth, in rupees, so we handle it with the right care.");
  return ask;
}

// ---------- Distance ----------

const rad = (x: number) => (x * Math.PI) / 180;
/** Straight-line distance in km between two points on the map. */
export function straightLineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** A road is longer than the straight line. The factor is on the rate card and the desk can overrule it. */
export const roadKm = (straight: number, factor: number) => Math.round(straight * factor * 10) / 10;

/** A link that opens the route in Google Maps for a person to check. No key and no data is sent from here. */
export function mapsRouteLink(from: string, to: string): string {
  const q = (s: string) => encodeURIComponent(`${s}, Mumbai`);
  return `https://www.google.com/maps/dir/?api=1&origin=${q(from)}&destination=${q(to)}&travelmode=two_wheeler`;
}

// ---------- The calculation ----------

export interface PriceInput {
  service: Service;
  distanceKm: number;
  distanceIsEstimate?: boolean;
  returnTrip: boolean;
  extraStops: number;
  waitMinutes: number;
  urgency: Urgency;
  /** Wall-clock time in Mumbai, "YYYY-MM-DDTHH:MM". Empty means no time given. */
  whenLocal: string;
  sizeClass: SizeClass;
  weightKg: number;
  heavyRain: boolean;
  thirdPartyInr: number;
  thirdPartyNote?: string;
  declaredValueInr: number;
  prohibitedItem: boolean;
  pickupPincode?: string;
  dropPincode?: string;
}

export type LineGroup = "rider" | "ev" | "third_party" | "ally" | "tax" | "rounding";
export interface Line { key: string; label: string; paise: number; note?: string; group: LineGroup }

export interface PriceResult {
  ok: boolean;
  blockers: string[];
  warnings: string[];
  lines: Line[];
  routeKm: number;
  riderPaise: number;
  evPaise: number;
  thirdPartyPaise: number;
  costsPaise: number;
  allyFeePaise: number;
  taxPaise: number;
  roundingPaise: number;
  totalPaise: number;
  /** What share of the customer's total is Ally's fee. */
  feeShareOfTotalPct: number;
  assumptions: string[];
}

const P = (rupees: number) => Math.round(rupees * 100);
const pct = (paise: number, p: number) => Math.round((paise * p) / 100);
export const rupees = (paise: number) => paise / 100;
/** Anything that is not a known urgency falls back to today, so a bad value can never skip the urgency line. */
export const urgencyOrDefault = (u: unknown): Urgency => ((URGENCIES as readonly unknown[]).includes(u) ? (u as Urgency) : "standard");

function parseLocal(whenLocal: string): { hour: number; weekday: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(whenLocal);
  if (!m) return null;
  const [y, mo, d, h] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23) return null;
  return { hour: h, weekday: date.getUTCDay() };
}
const isNight = (hour: number, from: number, to: number) => (from > to ? hour >= from || hour < to : hour >= from && hour < to);

export function calculatePrice(input: PriceInput, card: RateCard = DEFAULT_RATE_CARD): PriceResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const lines: Line[] = [];
  const add = (group: LineGroup, key: string, label: string, paise: number, note?: string) => { if (paise !== 0) lines.push({ key, label, paise, note, group }); };

  const bad = (n: number) => !Number.isFinite(n) || n < 0;
  if ([input.distanceKm, input.extraStops, input.waitMinutes, input.weightKg, input.thirdPartyInr, input.declaredValueInr].some(bad)) blockers.push("A number was negative or not a number. Check the figures.");

  const needsRoute = input.service !== "errand";
  const oneWay = bad(input.distanceKm) ? 0 : input.distanceKm;
  if (needsRoute && oneWay <= 0) blockers.push("Add the distance. Open the route in Maps and enter the road distance in km.");
  if (oneWay > card.evMaxRouteKm) blockers.push(`The route is ${oneWay} km one way. An EV does up to ${card.evMaxRouteKm} km in one trip. Price this by hand or split it.`);
  if (input.weightKg > card.evMaxWeightKg) blockers.push(`${input.weightKg} kg is over the ${card.evMaxWeightKg} kg an EV scooter carries. Price this by hand.`);
  if (input.sizeClass === "large") warnings.push("Large or awkward items may not fit on a scooter. Check before you promise.");
  if (input.prohibitedItem) blockers.push("This is something we do not carry (cash, valuables, illegal or dangerous items). Decline it politely.");
  for (const [name, pin] of [["pickup", input.pickupPincode], ["drop-off", input.dropPincode]] as const) {
    if (pin && isInServiceArea(pin, card) === false) blockers.push(`The ${name} PIN code ${pin} is outside Mumbai. We only work in Mumbai for now.`);
  }
  if (input.declaredValueInr >= card.highValueInr) warnings.push(`Declared value is Rs ${input.declaredValueInr.toLocaleString("en-IN")}. Have a second person agree before taking it on.`);
  if (input.distanceIsEstimate) warnings.push("The distance is an estimate from the map. Check the route before you send this.");
  if (input.thirdPartyInr > 0 && !input.thirdPartyNote?.trim()) warnings.push("Say what the provider or materials cost covers, so the customer can see it.");
  if (input.urgency === "express") warnings.push("As soon as possible depends on a rider being free. Check before you promise a time.");

  const routeKm = Math.round(oneWay * (input.returnTrip ? 2 : 1) * 10) / 10;

  // 1. The rider.
  const base = P(card.riderBaseInr);
  const perKm = Math.round(P(card.riderPerKmInr) * routeKm);
  const stops = P(card.extraStopInr) * Math.max(0, Math.floor(input.extraStops || 0));
  const subtotal = needsRoute ? base + perKm + stops : base + stops;
  add("rider", "rider_base", "Rider, per task", base);
  add("rider", "rider_km", `Rider, ${routeKm} km${input.returnTrip ? " (there and back)" : ""} at Rs ${card.riderPerKmInr}/km`, needsRoute ? perKm : 0);
  add("rider", "rider_stops", `Extra stops (${Math.max(0, Math.floor(input.extraStops || 0))})`, stops);
  const mult = card.urgencyMultiplier[input.urgency] ?? 1;
  const urgencyPaise = Math.round(subtotal * (mult - 1));
  add("rider", "rider_urgency", `Rider, ${URGENCY_LABEL[input.urgency].toLowerCase()} (x${mult})`, urgencyPaise);
  const afterUrgency = subtotal + urgencyPaise;
  const when = parseLocal(input.whenLocal);
  if (!input.whenLocal) assumptions.push("No time was given, so no night or Sunday extra was added.");
  if (input.whenLocal && !when) warnings.push("The time was not understood, so no night or Sunday extra was added.");
  if (when && isNight(when.hour, card.nightFromHour, card.nightToHour)) add("rider", "rider_night", `Rider, night work (${card.nightFromHour}:00 to ${card.nightToHour}:00) +${card.nightUpliftPct}%`, pct(afterUrgency, card.nightUpliftPct));
  if (when && when.weekday === 0) add("rider", "rider_sunday", `Rider, Sunday +${card.sundayUpliftPct}%`, pct(afterUrgency, card.sundayUpliftPct));
  const wait = Math.max(0, (input.waitMinutes || 0) - card.freeWaitMinutes);
  add("rider", "rider_wait", `Waiting, ${wait} min after the first ${card.freeWaitMinutes} free`, Math.round(P(card.riderWaitPerMinInr) * wait));
  add("rider", "rider_size", `Item size: ${SIZE_LABEL[input.sizeClass].toLowerCase()}`, P(card.sizeSurchargeInr[input.sizeClass] ?? 0));
  if (input.heavyRain) add("rider", "rider_rain", "Rider, heavy rain", P(card.heavyRainBonusInr));
  const riderPaise = lines.filter((l) => l.group === "rider").reduce((n, l) => n + l.paise, 0);

  // 2. The electric vehicle.
  const evKm = needsRoute ? Math.round((P(card.evEnergyPerKmInr) + P(card.evMaintenancePerKmInr)) * routeKm) : 0;
  add("ev", "ev_running", `EV charging and upkeep, ${routeKm} km`, evKm);
  add("ev", "ev_overhead", "EV insurance, phone and kit, per task", needsRoute ? P(card.evPerTaskOverheadInr) : 0);
  const evPaise = lines.filter((l) => l.group === "ev").reduce((n, l) => n + l.paise, 0);

  // 3. A provider or materials, passed on at cost.
  const thirdPartyPaise = P(Math.max(0, input.thirdPartyInr || 0));
  add("third_party", "third_party", "Provider, materials or government fees, at cost", thirdPartyPaise, input.thirdPartyNote?.trim() || undefined);

  const costsPaise = riderPaise + evPaise + thirdPartyPaise;

  // 4. Ally's fee.
  const rawFee = card.feeBasis === "on_costs" ? pct(costsPaise, card.feePct) : Math.round((costsPaise * card.feePct) / (100 - card.feePct));
  const minFee = P(card.minFeeInr);
  const feeBase = Math.max(rawFee, costsPaise > 0 ? minFee : 0);
  add("ally", "ally_fee", card.feeBasis === "on_costs" ? `Ally service fee, ${card.feePct}% of costs` : `Ally service fee, ${card.feePct}% of the price`, rawFee);
  if (feeBase > rawFee) add("ally", "ally_min_fee", "Minimum Ally fee top-up", feeBase - rawFee);

  // 5. Taxes. The rate is set by the accountant. This tool does not decide it.
  const taxBase = card.taxBasis === "ally_fee" ? feeBase : costsPaise + feeBase;
  const taxPaise = pct(taxBase, card.taxPct);
  add("tax", "tax", `Taxes, ${card.taxPct}% of ${card.taxBasis === "ally_fee" ? "Ally's fee" : "the whole price"}`, taxPaise);
  if (card.taxPct === 0) assumptions.push("No tax is added. Your accountant sets the tax rate on the rate card.");

  // 6. Minimum charge and rounding up, shown as their own lines.
  let total = costsPaise + feeBase + taxPaise;
  const minTotal = P(card.minTotalInr);
  if (costsPaise > 0 && total < minTotal) { add("ally", "ally_min_total", "Minimum charge top-up", minTotal - total); total = minTotal; }
  const step = P(card.roundToInr);
  const rounded = Math.ceil(total / step) * step;
  add("rounding", "rounding", `Rounded up to the next Rs ${card.roundToInr}`, rounded - total);
  total = rounded;

  const allyFeePaise = lines.filter((l) => l.group === "ally").reduce((n, l) => n + l.paise, 0);
  const feeShareOfTotalPct = total > 0 ? Math.round((allyFeePaise / total) * 1000) / 10 : 0;
  assumptions.push("Rates on the card are starting values. Check them against real trip costs.");

  return {
    ok: blockers.length === 0 && total > 0,
    blockers, warnings, lines, routeKm,
    riderPaise, evPaise, thirdPartyPaise, costsPaise, allyFeePaise, taxPaise,
    roundingPaise: lines.filter((l) => l.group === "rounding").reduce((n, l) => n + l.paise, 0),
    totalPaise: total, feeShareOfTotalPct, assumptions,
  };
}

/** The three numbers the existing quotation form takes, in whole rupees, adding up to the total. */
export function quoteParts(r: PriceResult): { providerFeeInr: number; coordinationFeeInr: number; taxesInr: number; totalInr: number } {
  const total = Math.round(r.totalPaise / 100);
  const taxes = Math.round(r.taxPaise / 100);
  const provider = Math.round((r.riderPaise + r.evPaise + r.thirdPartyPaise) / 100);
  return { providerFeeInr: provider, taxesInr: taxes, coordinationFeeInr: total - provider - taxes, totalInr: total };
}

// ---------- Currency ----------

export const CURRENCIES = ["USD", "GBP", "EUR", "CAD", "AUD", "SGD", "AED"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const CURRENCY_NAME: Record<Currency, string> = { USD: "US dollar", GBP: "British pound", EUR: "Euro", CAD: "Canadian dollar", AUD: "Australian dollar", SGD: "Singapore dollar", AED: "UAE dirham" };

const COUNTRY_CURRENCY: Record<string, Currency> = {
  "united states": "USD", usa: "USD", us: "USD", "united kingdom": "GBP", uk: "GBP", england: "GBP", scotland: "GBP", wales: "GBP",
  canada: "CAD", australia: "AUD", singapore: "SGD", "united arab emirates": "AED", uae: "AED", dubai: "AED",
  germany: "EUR", france: "EUR", ireland: "EUR", netherlands: "EUR", italy: "EUR", spain: "EUR", portugal: "EUR", belgium: "EUR", austria: "EUR", finland: "EUR",
};
/** The customer's own currency, from the country they gave. Unknown means we show rupees only, which is honest. */
export function currencyForCountry(country: string | null | undefined): Currency | null {
  return country ? COUNTRY_CURRENCY[country.trim().toLowerCase()] ?? null : null;
}

/** Rupees to another currency at a rate of units per rupee, with an optional buffer that is always shown to the customer. */
export function convertInr(inr: number, perInr: number, bufferPct = 0): number {
  if (!(perInr > 0) || !(inr >= 0)) return 0;
  return Math.round(inr * perInr * (1 + bufferPct / 100) * 100) / 100;
}
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// ---------- From a request to a price ----------

/** Starting inputs for the calculator, taken from what the customer told us. The desk can change every one. */
export function inputFromDetails(d: RequestDetails): Partial<PriceInput> & { whenLocal: string } {
  const date = d.window.date;
  const time = d.window.from || "09:00";
  return {
    service: d.service,
    urgency: d.urgency,
    returnTrip: d.returnTrip,
    waitMinutes: d.waitMinutes,
    whenLocal: date ? `${date}T${time}` : "",
    sizeClass: d.item.size,
    weightKg: d.item.weightKg,
    declaredValueInr: d.item.valueInr,
    pickupPincode: d.pickup.pincode,
    dropPincode: d.service === "delivery" ? d.drop.pincode : "",
  };
}

/** A short, plain note for the customer's quotation. No cost detail beyond what the quotation already shows. */
export function customerNotes(i: Pick<PriceInput, "service" | "urgency" | "returnTrip">, r: Pick<PriceResult, "routeKm">, from?: string, to?: string): string {
  const what = i.service === "delivery" ? "Pick up and drop" : i.service === "visit" ? "A visit" : "Arranged with a provider";
  const route = i.service === "errand" ? "" : ` About ${r.routeKm} km${i.returnTrip ? " there and back" : ""} on an electric scooter.`;
  const places = from ? ` ${to ? `From ${from} to ${to}.` : `At ${from}.`}` : "";
  return `${what}.${places}${route} ${URGENCY_LABEL[i.urgency]}. Paid in full before the work starts.`.replace(/\s+/g, " ").trim();
}

/** Splits the cost into who gets what, for the desk's own view. */
export function costShares(r: PriceResult): { rider: number; ev: number; thirdParty: number; ally: number; tax: number } {
  return { rider: rupees(r.riderPaise), ev: rupees(r.evPaise), thirdParty: rupees(r.thirdPartyPaise), ally: rupees(r.allyFeePaise), tax: rupees(r.taxPaise) };
}
