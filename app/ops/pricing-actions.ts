"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionViewer, isStaff } from "@/lib/auth";
import { activeRateCard, refreshFxRates, saveEstimate, saveRateCard, setFxRate } from "@/lib/pricing";
import { CURRENCIES, customerNotes, missingDetails, SERVICES, SIZES, URGENCIES, type Currency } from "@/lib/pricing-rules";
import { addRequestUpdate, getRequest, setRequestStatus } from "@/lib/service-requests";

type Msg = { ok: boolean; message: string } | null;
async function staff() { const v = await actionViewer(); return isStaff(v) ? v! : null; }
async function admin() { const v = await actionViewer(); return v?.role === "admin" ? v : null; }
const refresh = () => revalidatePath("/ops", "layout");

const priceInput = z.object({
  service: z.enum(SERVICES),
  distanceKm: z.number().finite().min(0).max(1000),
  distanceIsEstimate: z.boolean().optional(),
  returnTrip: z.boolean(),
  extraStops: z.number().int().min(0).max(50),
  waitMinutes: z.number().finite().min(0).max(1000),
  urgency: z.enum(URGENCIES),
  whenLocal: z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/),
  sizeClass: z.enum(SIZES),
  weightKg: z.number().finite().min(0).max(1000),
  heavyRain: z.boolean(),
  thirdPartyInr: z.number().finite().min(0).max(100000000),
  thirdPartyNote: z.string().trim().max(200).optional(),
  declaredValueInr: z.number().finite().min(0).max(100000000),
  prohibitedItem: z.boolean(),
  pickupPincode: z.string().regex(/^(\d{6})?$/).optional(),
  dropPincode: z.string().regex(/^(\d{6})?$/).optional(),
});

export type UsedEstimate = { ok: true; estimateId: string; providerFeeInr: number; coordinationFeeInr: number; taxesInr: number; totalInr: number; notes: string; rateCardVersion: number } | { ok: false; message: string };

/**
 * Saves the price and returns the three quotation amounts. The price is worked out again here from the inputs,
 * so what is saved never depends on a sum done in the browser.
 */
export async function saveEstimateAction(requestId: string, raw: unknown, currency: string, from: string, to: string): Promise<UsedEstimate> {
  const v = await staff();
  if (!v) return { ok: false, message: "Please sign in again." };
  const p = priceInput.safeParse(raw);
  if (!p.success) return { ok: false, message: "Please check the figures." };
  const cur = (CURRENCIES as readonly string[]).includes(currency) ? (currency as Currency) : "INR";
  const r = await saveEstimate({ requestId, price: p.data, currency: cur, userId: v.id });
  if (!r.ok) return { ok: false, message: r.reason };
  const rc = await activeRateCard();
  refresh();
  return { ok: true, estimateId: r.id, ...r.parts, notes: customerNotes(p.data, r.result, from.slice(0, 80), to.slice(0, 80)), rateCardVersion: rc.version };
}

/** Tells the customer, in one message, exactly what is still needed, and moves the request to waiting on them. */
export async function askCustomerAction(requestId: string): Promise<NonNullable<Msg>> {
  const v = await staff();
  if (!v) return { ok: false, message: "Please sign in again." };
  const req = await getRequest(requestId);
  if (!req) return { ok: false, message: "Request not found." };
  const rc = await activeRateCard();
  const ask = missingDetails(req.details, rc.card);
  if (ask.length === 0) return { ok: false, message: "Nothing is missing. You can price this now." };
  const body = `To give you an exact price, please add:\n${ask.map((a) => `- ${a}`).join("\n")}\nYou can add them under "Where and when" on this request.`;
  const u = await addRequestUpdate(requestId, body, true, v.id, v.name);
  if (!u.ok) return { ok: false, message: u.reason ?? "That did not send." };
  if (req.status !== "awaiting_information") await setRequestStatus(requestId, "awaiting_information", "Waiting for the details above.", v.id, v.name);
  refresh();
  revalidatePath("/family", "layout");
  return { ok: true, message: `Asked the customer for ${ask.length} thing${ask.length === 1 ? "" : "s"}.` };
}

// ---------- The rate card and exchange rates: admin only ----------

const num = (form: FormData, key: string) => { const raw = form.get(key); return typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN; };

export async function saveRateCardAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await admin();
  if (!v) return { ok: false, message: "Only an admin can change the rate card." };
  const n = (k: string) => num(form, k);
  const config = {
    riderBaseInr: n("riderBaseInr"), riderPerKmInr: n("riderPerKmInr"), freeWaitMinutes: n("freeWaitMinutes"), riderWaitPerMinInr: n("riderWaitPerMinInr"), extraStopInr: n("extraStopInr"),
    urgencyMultiplier: { scheduled: n("urg_scheduled"), standard: n("urg_standard"), priority: n("urg_priority"), express: n("urg_express") },
    nightUpliftPct: n("nightUpliftPct"), nightFromHour: n("nightFromHour"), nightToHour: n("nightToHour"), sundayUpliftPct: n("sundayUpliftPct"), heavyRainBonusInr: n("heavyRainBonusInr"),
    sizeSurchargeInr: { envelope: n("size_envelope"), small: n("size_small"), medium: n("size_medium"), large: n("size_large") },
    evEnergyPerKmInr: n("evEnergyPerKmInr"), evMaintenancePerKmInr: n("evMaintenancePerKmInr"), evPerTaskOverheadInr: n("evPerTaskOverheadInr"),
    feePct: n("feePct"), feeBasis: form.get("feeBasis"), minFeeInr: n("minFeeInr"), taxPct: n("taxPct"), taxBasis: form.get("taxBasis"), minTotalInr: n("minTotalInr"), roundToInr: n("roundToInr"),
    evMaxRouteKm: n("evMaxRouteKm"), evMaxWeightKg: n("evMaxWeightKg"), highValueInr: n("highValueInr"), roadFactor: n("roadFactor"), areaPinFrom: n("areaPinFrom"), areaPinTo: n("areaPinTo"), fxBufferPct: n("fxBufferPct"), quoteValidHours: n("quoteValidHours"),
  };
  const note = typeof form.get("note") === "string" ? (form.get("note") as string).trim() : "";
  if (!note) return { ok: false, message: "Say why you are changing the rates, in a few words." };
  const r = await saveRateCard(config, note, v.id);
  refresh();
  return { ok: r.ok, message: r.ok ? "Saved as a new version. Old prices keep the rates they used." : (r.reason ?? "That did not save.") };
}

export async function refreshFxAction(): Promise<Msg> {
  const v = await admin();
  if (!v) return { ok: false, message: "Only an admin can change exchange rates." };
  const r = await refreshFxRates(v.id);
  refresh();
  return { ok: r.ok, message: r.ok ? `Updated ${r.updated} currencies.` : (r.reason ?? "That did not work.") };
}

export async function setFxAction(_p: Msg, form: FormData): Promise<Msg> {
  const v = await admin();
  if (!v) return { ok: false, message: "Only an admin can change exchange rates." };
  const p = z.object({ currency: z.string().length(3), perInr: z.coerce.number() }).safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, message: "Please check the currency and the rate." };
  const r = await setFxRate(p.data.currency, p.data.perInr, v.id);
  refresh();
  return { ok: r.ok, message: r.ok ? "Saved. It is marked as entered by hand." : (r.reason ?? "That did not save.") };
}
