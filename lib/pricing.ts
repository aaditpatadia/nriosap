import "server-only";
import { cache } from "react";
import { asService, isUuid, one, rows, tx } from "./db";
import { log } from "./log";
import {
  calculatePrice, currencyForCountry, CURRENCIES, DEFAULT_RATE_CARD, quoteParts, rateCardSchema, urgencyOrDefault, withDefaults,
  type Currency, type PriceInput, type PriceResult, type RateCard,
} from "./pricing-rules";

type Row = Record<string, any>;

// ---------- The rate card ----------

export interface SavedRateCard { id: string | null; version: number; card: RateCard; note: string | null; createdAt: string | null }

/** The newest card. If none was ever saved, the starting values are used and version is 0. */
export const activeRateCard = cache(async function activeRateCard(): Promise<SavedRateCard> {
  const r = await one<Row>("select id, version, config, note, created_at from rate_cards order by version desc limit 1");
  if (!r) return { id: null, version: 0, card: DEFAULT_RATE_CARD, note: null, createdAt: null };
  return { id: r.id, version: r.version, card: withDefaults(r.config), note: r.note, createdAt: r.created_at };
});

export async function rateCardHistory(limit = 10): Promise<{ version: number; note: string | null; createdAt: string; by: string | null }[]> {
  return (await rows<Row>("select c.version, c.note, c.created_at, p.name as by from rate_cards c left join profiles p on p.id = c.created_by order by c.version desc limit $1", [limit])).map((r) => ({ version: r.version, note: r.note, createdAt: r.created_at, by: r.by ?? null }));
}

/** Only an admin may change the card. The numbers are checked again here, whatever the browser sent. */
export async function saveRateCard(config: unknown, note: string, userId: string): Promise<{ ok: boolean; reason?: string }> {
  const parsed = rateCardSchema.safeParse(config);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "Please check the rates." };
  const admin = await one<Row>("select public.is_admin() as admin");
  if (!admin?.admin) return { ok: false, reason: "Only an admin can change the rate card." };
  await asService(() => tx(async (t) => {
    const v = await t.one<Row>("select coalesce(max(version), 0) + 1 as next from rate_cards");
    await t.run("insert into rate_cards(version, config, note, created_by) values ($1,$2,$3,$4)", [v!.next, JSON.stringify(parsed.data), note.slice(0, 200) || null, userId]);
    await t.run("insert into audit_log(actor_id, action, entity, entity_id) values ($1,'rate_card_changed','rate_card',$2)", [userId, String(v!.next)]);
  }));
  return { ok: true };
}

// ---------- Exchange rates ----------

export interface FxRate { currency: Currency; perInr: number; asOf: string; source: string }

export const fxRates = cache(async function fxRates(): Promise<FxRate[]> {
  return (await rows<Row>("select currency, per_inr, as_of, source from fx_rates order by currency")).filter((r) => (CURRENCIES as readonly string[]).includes(r.currency)).map((r) => ({ currency: r.currency, perInr: Number(r.per_inr), asOf: r.as_of, source: r.source }));
});

const FX_URL = "https://open.er-api.com/v6/latest/INR";
export const FX_SOURCE = "Exchange Rate API (open access)";

/** Pulls today's rates for the customer currencies. Sends nothing about anyone. A person presses the button. */
export async function refreshFxRates(userId: string, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; reason?: string; updated?: number }> {
  let body: any;
  try {
    const res = await fetcher(FX_URL, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, reason: `The rate service answered ${res.status}.` };
    body = await res.json();
  } catch {
    return { ok: false, reason: "Could not reach the rate service. Enter the rates by hand, or try again." };
  }
  if (body?.result !== "success" || body?.base_code !== "INR" || typeof body?.rates !== "object") return { ok: false, reason: "The rate service sent something unexpected." };
  const asOf = typeof body.time_last_update_unix === "number" ? new Date(body.time_last_update_unix * 1000).toISOString() : new Date().toISOString();
  const good = CURRENCIES.map((c) => [c, Number(body.rates[c])] as const).filter(([, n]) => Number.isFinite(n) && n > 0 && n < 1);
  if (good.length === 0) return { ok: false, reason: "No usable rates came back." };
  await asService(() => tx(async (t) => {
    for (const [c, n] of good) {
      await t.run("insert into fx_rates(currency, per_inr, as_of, source, set_by) values ($1,$2,$3,$4,$5) on conflict (currency) do update set per_inr = excluded.per_inr, as_of = excluded.as_of, source = excluded.source, set_by = excluded.set_by, updated_at = now()", [c, n, asOf, FX_SOURCE, userId]);
    }
    await t.run("insert into audit_log(actor_id, action, entity, entity_id) values ($1,'fx_refreshed','fx_rates',$2)", [userId, good.map(([c]) => c).join(",")]);
  }));
  log("info", "fx_refreshed", { count: good.length });
  return { ok: true, updated: good.length };
}

/** A rate typed by hand, for when the service is down. Marked as manual so nobody mistakes it for a feed. */
export async function setFxRate(currency: string, perInr: number, userId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!(CURRENCIES as readonly string[]).includes(currency)) return { ok: false, reason: "That currency is not supported." };
  if (!(perInr > 0 && perInr < 1)) return { ok: false, reason: "Enter how many units of that currency one rupee buys, for example 0.0106." };
  await asService(() => tx(async (t) => {
    await t.run("insert into fx_rates(currency, per_inr, as_of, source, set_by) values ($1,$2,now(),'Entered by hand',$3) on conflict (currency) do update set per_inr = excluded.per_inr, as_of = now(), source = 'Entered by hand', set_by = excluded.set_by, updated_at = now()", [currency, perInr, userId]);
    await t.run("insert into audit_log(actor_id, action, entity, entity_id) values ($1,'fx_set_by_hand','fx_rates',$2)", [userId, currency]);
  }));
  return { ok: true };
}

// ---------- Saved prices ----------

export interface SavedEstimate { id: string; requestId: string | null; version: number | null; inputs: PriceInput; result: PriceResult; totalInr: number; allyFeeInr: number; currency: string; fxPerInr: number | null; fxAsOf: string | null; createdAt: string }

/**
 * Works the price out again from the inputs on the server, saves it with the rate card it used, and returns the three quotation parts.
 * The browser's own sum is only for show. This one is the record.
 */
export async function saveEstimate(input: { requestId?: string | null; familyId?: string | null; price: PriceInput; currency: Currency | "INR"; userId: string }): Promise<{ ok: true; id: string; result: PriceResult; parts: ReturnType<typeof quoteParts> } | { ok: false; reason: string }> {
  const rc = await activeRateCard();
  const usd = (await fxRates()).find((x) => x.currency === "USD");
  const priced: PriceInput = { ...input.price, urgency: urgencyOrDefault(input.price.urgency), usdPerInr: usd?.perInr };
  const result = calculatePrice(priced, rc.card);
  if (!result.ok) return { ok: false, reason: result.blockers[0] ?? "This cannot be priced." };
  let familyId = input.familyId ?? null;
  let requestId: string | null = null;
  if (input.requestId) {
    if (!isUuid(input.requestId)) return { ok: false, reason: "Request not found." };
    const r = await one<Row>("select family_id from service_requests where id = $1 and public.can_work_family(family_id)", [input.requestId]);
    if (!r) return { ok: false, reason: "That request is not on your list." };
    familyId = r.family_id;
    requestId = input.requestId;
  }
  let fx: FxRate | undefined;
  if (input.currency !== "INR") fx = (await fxRates()).find((x) => x.currency === input.currency);
  const parts = quoteParts(result);
  const id = await asService(() => tx(async (t) => {
    const e = await t.one<Row>(
      "insert into price_estimates(family_id, request_id, rate_card_id, inputs, breakdown, total_inr, ally_fee_inr, currency, fx_per_inr, fx_as_of, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id",
      [familyId, requestId, rc.id, JSON.stringify(priced), JSON.stringify(result), parts.totalInr, Math.round(result.allyFeePaise / 100), fx ? fx.currency : "INR", fx?.perInr ?? null, fx?.asOf ?? null, input.userId],
    );
    await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'price_calculated','price_estimate',$2,$3)", [input.userId, e!.id, familyId]);
    return e!.id as string;
  }));
  return { ok: true, id, result, parts };
}

export async function estimatesForRequest(requestId: string): Promise<SavedEstimate[]> {
  if (!isUuid(requestId)) return [];
  return (await rows<Row>("select e.*, c.version from price_estimates e left join rate_cards c on c.id = e.rate_card_id where e.request_id = $1 order by e.created_at desc", [requestId])).map((e) => ({
    id: e.id, requestId: e.request_id, version: e.version ?? null, inputs: e.inputs, result: e.breakdown, totalInr: Number(e.total_inr), allyFeeInr: Number(e.ally_fee_inr),
    currency: e.currency, fxPerInr: e.fx_per_inr ? Number(e.fx_per_inr) : null, fxAsOf: e.fx_as_of, createdAt: e.created_at,
  }));
}

/** The currency to show a family, from the country their owner gave. Only for the desk, who may read it. */
export async function ownerCurrency(familyId: string): Promise<Currency | null> {
  if (!isUuid(familyId)) return null;
  const r = await asService(() => one<Row>("select p.country from families f join profiles p on p.id = f.owner_id where f.id = $1", [familyId]));
  return currencyForCountry(r?.country);
}
