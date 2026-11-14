import { beforeAll, describe, expect, inject, it } from "vitest";
import pg from "pg";
import { asRole, ID } from "./helpers";

const url = inject("dbUrl");
let db: pg.Client;

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = "disable";
  process.env.APP_ENCRYPTION_KEY = "test-only-encryption-key-at-least-32-bytes";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unused";
  db = new pg.Client({ connectionString: url });
  await db.connect();
});

const as = async <T>(id: string, fn: () => Promise<T>) => {
  const { withContext } = await import("@/lib/db");
  return withContext({ kind: "user", id }, fn);
};
const pricing = () => import("@/lib/pricing");
const svc = () => import("@/lib/service-requests");
const rules = () => import("@/lib/pricing-rules");

async function newRequest(details?: unknown) {
  const { createServiceRequest } = await svc();
  const r = await as(ID.owner, () => createServiceRequest({ familyId: ID.fam, description: "Please collect a file from my flat in Bandra and bring it to Powai.", attachmentIds: [], userId: ID.owner, userName: "Owner", details: details as never }));
  if (!r.ok) throw new Error(r.reason);
  return r.id;
}
const trip = () => ({ service: "delivery" as const, distanceKm: 9, returnTrip: false, extraStops: 0, waitMinutes: 0, urgency: "standard" as const, whenLocal: "", sizeClass: "small" as const, weightKg: 1, heavyRain: false, thirdPartyInr: 0, declaredValueInr: 0, prohibitedItem: false, pickupPincode: "400050", dropPincode: "400076" });

describe("the rate card", () => {
  it("starts from the built-in values, and only an admin can save a new version", async () => {
    const { activeRateCard, saveRateCard } = await pricing();
    const { DEFAULT_RATE_CARD } = await rules();
    expect((await as(ID.coord, () => activeRateCard())).version).toBeGreaterThanOrEqual(0);
    expect((await as(ID.coord, () => saveRateCard(DEFAULT_RATE_CARD, "try", ID.coord))).ok).toBe(false);
    const ok = await as(ID.admin, () => saveRateCard({ ...DEFAULT_RATE_CARD, riderBaseInr: 35 }, "first month of real trips", ID.admin));
    expect(ok.ok).toBe(true);
    const now = await as(ID.coord, () => activeRateCard());
    expect(now.card.riderBaseInr).toBe(35);
    expect(now.version).toBeGreaterThanOrEqual(1);
    const second = await as(ID.admin, () => saveRateCard({ ...DEFAULT_RATE_CARD, riderBaseInr: 40 }, "second", ID.admin));
    expect(second.ok).toBe(true);
    expect((await db.query("select count(*)::int n from rate_cards")).rows[0].n).toBeGreaterThanOrEqual(2);
    expect((await db.query("select count(*)::int n from audit_log where action = 'rate_card_changed'")).rows[0].n).toBeGreaterThanOrEqual(2);
  });
  it("rejects a card with a mistake, even from an admin", async () => {
    const { saveRateCard } = await pricing();
    const { DEFAULT_RATE_CARD } = await rules();
    expect((await as(ID.admin, () => saveRateCard({ ...DEFAULT_RATE_CARD, feePct: 250 }, "typo", ID.admin))).ok).toBe(false);
    expect((await as(ID.admin, () => saveRateCard({ riderBaseInr: "lots" }, "typo", ID.admin))).ok).toBe(false);
  });
  it("is hidden from customers by row security", async () => {
    expect((await asRole(url, "authenticated", ID.owner, (c) => c.query("select 1 from rate_cards"))).rowCount).toBe(0);
    expect((await asRole(url, "authenticated", ID.coord, (c) => c.query("select 1 from rate_cards"))).rowCount).toBeGreaterThan(0);
    expect((await asRole(url, "anon", null, (c) => c.query("select 1 from rate_cards"))).rowCount).toBe(0);
  });
});

describe("exchange rates", () => {
  it("are saved from the service when the answer looks right, and marked with their source", async () => {
    const { refreshFxRates, fxRates } = await pricing();
    const fake = (async () => new Response(JSON.stringify({ result: "success", base_code: "INR", time_last_update_unix: 1794614551, rates: { INR: 1, USD: 0.0106, GBP: 0.0082, EUR: 0.0096, AED: 0.0389, CAD: 0.0151, AUD: 0.0156, SGD: 0.0137, XYZ: 5 } }))) as typeof fetch;
    const r = await as(ID.admin, () => refreshFxRates(ID.admin, fake));
    expect(r).toMatchObject({ ok: true, updated: 7 });
    const rates = await as(ID.owner, () => fxRates());
    expect(rates.find((x) => x.currency === "USD")?.perInr).toBe(0.0106);
    expect(rates.some((x) => (x.currency as string) === "XYZ")).toBe(false);
    expect(rates[0].source).toMatch(/Exchange Rate API/);
  });
  it("refuse an answer that is wrong, and never replace a good rate with rubbish", async () => {
    const { refreshFxRates } = await pricing();
    const bad = (async () => new Response(JSON.stringify({ result: "success", base_code: "USD", rates: { USD: 1 } }))) as typeof fetch;
    expect((await as(ID.admin, () => refreshFxRates(ID.admin, bad))).ok).toBe(false);
    const broken = (async () => { throw new Error("offline"); }) as typeof fetch;
    expect((await as(ID.admin, () => refreshFxRates(ID.admin, broken))).ok).toBe(false);
    const absurd = (async () => new Response(JSON.stringify({ result: "success", base_code: "INR", rates: { USD: 83, GBP: -1, EUR: "x" } }))) as typeof fetch;
    expect((await as(ID.admin, () => refreshFxRates(ID.admin, absurd))).ok).toBe(false);
    expect(Number((await db.query("select per_inr from fx_rates where currency = 'USD'")).rows[0].per_inr)).toBe(0.0106);
  });
  it("can be set by hand within sensible limits, and are readable by customers but not writable", async () => {
    const { setFxRate } = await pricing();
    expect((await as(ID.admin, () => setFxRate("CAD", 0.0152, ID.admin))).ok).toBe(true);
    expect((await as(ID.admin, () => setFxRate("CAD", 83, ID.admin))).ok).toBe(false);
    expect((await as(ID.admin, () => setFxRate("JPY", 1.5, ID.admin))).ok).toBe(false);
    expect((await db.query("select source from fx_rates where currency = 'CAD'")).rows[0].source).toBe("Entered by hand");
    expect((await asRole(url, "authenticated", ID.owner, (c) => c.query("select 1 from fx_rates"))).rowCount).toBeGreaterThan(0);
    await expect(asRole(url, "authenticated", ID.owner, (c) => c.query("update fx_rates set per_inr = 1"))).resolves.toMatchObject({ rowCount: 0 });
  });
});

describe("where and when on a request", () => {
  it("are stored with the request, and a rushed request is marked urgent", async () => {
    const id = await newRequest({ service: "delivery", urgency: "express", pickup: { pincode: "400050", area: "Bandra West" }, drop: { pincode: "400076" } });
    const r = (await db.query("select details, priority, location from service_requests where id = $1", [id])).rows[0];
    expect(r.details.service).toBe("delivery");
    expect(r.details.pickup.pincode).toBe("400050");
    expect(r.priority).toBe("urgent");
    expect(r.location).toBe("Mumbai");
  });
  it("can be added later by the owner or the desk, but not by another family or on a closed request", async () => {
    const { updateRequestDetails } = await svc();
    const { requestDetailsSchema } = await rules();
    const id = await newRequest();
    const d = requestDetailsSchema.parse({ service: "visit", pickup: { address: "12 Hill Road", pincode: "400050" } });
    expect((await as(ID.owner, () => updateRequestDetails(id, d, ID.owner, "Owner"))).ok).toBe(true);
    expect((await db.query("select details from service_requests where id = $1", [id])).rows[0].details.pickup.address).toBe("12 Hill Road");
    expect((await as(ID.coord, () => updateRequestDetails(id, d, ID.coord, "Coord"))).ok).toBe(true);
    expect((await as(ID.owner2, () => updateRequestDetails(id, d, ID.owner2, "Other"))).ok).toBe(false);
    expect((await as(ID.coord2, () => updateRequestDetails(id, d, ID.coord2, "Other"))).ok).toBe(false);
    await db.query("update service_requests set status = 'cancelled' where id = $1", [id]);
    expect((await as(ID.owner, () => updateRequestDetails(id, d, ID.owner, "Owner"))).ok).toBe(false);
  });
});

describe("a saved price", () => {
  it("is worked out again on the server, saved with the rate card it used, and kept from customers", async () => {
    const { saveEstimate, estimatesForRequest } = await pricing();
    const { calculatePrice } = await rules();
    const id = await newRequest();
    const price = trip();
    const r = await as(ID.coord, () => saveEstimate({ requestId: id, price, currency: "INR", userId: ID.coord }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { activeRateCard } = await pricing();
    const expected = calculatePrice(price, (await as(ID.coord, () => activeRateCard())).card);
    expect(r.result.totalPaise).toBe(expected.totalPaise);
    expect(r.parts.providerFeeInr + r.parts.coordinationFeeInr + r.parts.taxesInr).toBe(r.parts.totalInr);
    const saved = await as(ID.coord, () => estimatesForRequest(id));
    expect(saved).toHaveLength(1);
    expect(saved[0].version).not.toBeNull();
    expect((await asRole(url, "authenticated", ID.owner, (c) => c.query("select 1 from price_estimates where request_id = $1", [id]))).rowCount).toBe(0);
    expect((await asRole(url, "authenticated", ID.coord2, (c) => c.query("select 1 from price_estimates where request_id = $1", [id]))).rowCount).toBe(0);
  });
  it("cannot be saved for a request that is not on the person's list, or when it cannot be priced", async () => {
    const { saveEstimate } = await pricing();
    const id = await newRequest();
    const price = trip();
    expect((await as(ID.coord2, () => saveEstimate({ requestId: id, price, currency: "INR", userId: ID.coord2 }))).ok).toBe(false);
    const r = await as(ID.coord, () => saveEstimate({ requestId: id, price: { ...price, dropPincode: "411001" }, currency: "INR", userId: ID.coord }));
    expect(r).toMatchObject({ ok: false });
    expect((await as(ID.coord, () => saveEstimate({ requestId: id, price: { ...price, distanceKm: 0 }, currency: "INR", userId: ID.coord }))).ok).toBe(false);
  });
  it("keeps the customer's currency and the rate used, so the quotation stays steady", async () => {
    const { saveEstimate } = await pricing();
    const { createQuotation, quotesForRequest } = await svc();
    const id = await newRequest();
    const e = await as(ID.coord, () => saveEstimate({ requestId: id, price: trip(), currency: "USD", userId: ID.coord }));
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const q = await as(ID.coord, () => createQuotation(id, { providerName: "Ally delivery", providerFeeInr: e.parts.providerFeeInr, coordinationFeeInr: e.parts.coordinationFeeInr, taxesInr: e.parts.taxesInr, notes: "", estimateId: e.id }, ID.coord, "C"));
    expect(q.ok).toBe(true);
    const [quote] = await as(ID.owner, () => quotesForRequest(id));
    expect(quote).toMatchObject({ currency: "USD", advancePercent: 100, estimateId: e.id });
    expect(quote.fxPerInr).toBeGreaterThan(0);
    expect(quote.totalInr).toBe(e.parts.totalInr);
  });
});

describe("100% in advance", () => {
  it("work cannot start until a payment is confirmed with proof", async () => {
    const { createQuotation, setRequestStatus } = await svc();
    const { recordPayment, settlePayment, paymentsForRequest } = await import("@/lib/payment-records");
    const id = await newRequest();
    expect((await as(ID.coord, () => createQuotation(id, { providerName: "Ally delivery", providerFeeInr: 120, coordinationFeeInr: 30, taxesInr: 0, notes: "" }, ID.coord, "C"))).ok).toBe(true);
    await db.query("update quotations set status = 'approved' where request_id = $1", [id]);
    const blocked = await as(ID.coord, () => setRequestStatus(id, "in_progress", "", ID.coord, "C"));
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/pays in full before work starts/);
    expect((await as(ID.coord, () => setRequestStatus(id, "assigned", "", ID.coord, "C"))).ok).toBe(false);
    expect((await as(ID.coord, () => recordPayment(id, { method: "provider_link", linkUrl: "https://pay.example/x", note: "" }, ID.coord))).ok).toBe(true);
    const [p] = await as(ID.owner, () => paymentsForRequest(id));
    expect((await as(ID.coord, () => setRequestStatus(id, "in_progress", "", ID.coord, "C"))).ok).toBe(false); // pending is not paid
    expect((await as(ID.coord, () => settlePayment(p.id, "confirmed", { reference: "UTR9", receiptDocumentId: null }, ID.coord))).ok).toBe(true);
    expect((await as(ID.coord, () => setRequestStatus(id, "in_progress", "", ID.coord, "C"))).ok).toBe(true);
  });
  it("does not stop planning work that has no approved quotation yet", async () => {
    const { setRequestStatus } = await svc();
    const id = await newRequest();
    expect((await as(ID.coord, () => setRequestStatus(id, "under_review", "", ID.coord, "C"))).ok).toBe(true);
  });
});
