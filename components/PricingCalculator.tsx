"use client";

import { useMemo, useState, useTransition } from "react";
import { askCustomerAction, saveEstimateAction, type UsedEstimate } from "@/app/ops/pricing-actions";
import {
  calculatePrice, convertInr, costShares, formatMoney, mapsRouteLink, missingDetails, roadKm, SERVICE_LABEL, SERVICES, SIZE_LABEL, SIZES, straightLineKm, URGENCIES, URGENCY_LABEL,
  type Currency, type LineGroup, type PriceInput, type RateCard, type RequestDetails,
} from "@/lib/pricing-rules";

export interface FxOption { currency: Currency; perInr: number; asOf: string }
export interface CalcPreset { input: Partial<PriceInput>; from: string; to: string }

const GROUPS: { key: LineGroup; title: string; hint: string }[] = [
  { key: "rider", title: "Rider", hint: "Paid to the delivery partner" },
  { key: "ev", title: "Electric vehicle", hint: "Our own running cost" },
  { key: "third_party", title: "Provider or materials", hint: "Passed on at cost" },
  { key: "ally", title: "Ally service fee", hint: "Our fee" },
  { key: "tax", title: "Taxes", hint: "Rate set by your accountant" },
  { key: "rounding", title: "Rounding", hint: "Up to the next step" },
];
const rs = (n: number) => `Rs ${n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const n = (v: string) => (v.trim() === "" ? 0 : Number(v.replace(/,/g, "")));

const DEFAULT_INPUT: PriceInput = { service: "delivery", distanceKm: 0, returnTrip: false, extraStops: 0, waitMinutes: 0, urgency: "standard", whenLocal: "", sizeClass: "small", weightKg: 0, heavyRain: false, thirdPartyInr: 0, declaredValueInr: 0, prohibitedItem: false };

/**
 * The desk's calculator. It shows every line: what the rider gets, what the electric vehicle costs us, our fee, and the total.
 * The same rules run here and on the server. The server's answer is the one that is saved.
 */
export function PricingCalculator({ card, version, requestId, preset, details, fx = [], customerCurrency = null, onUse }: {
  card: RateCard; version: number; requestId?: string; preset?: CalcPreset; details?: RequestDetails; fx?: FxOption[]; customerCurrency?: Currency | null;
  onUse?: (e: Extract<UsedEstimate, { ok: true }>) => void;
}) {
  const start = { ...DEFAULT_INPUT, ...(preset?.input ?? {}) };
  const [f, setF] = useState({
    service: start.service, urgency: start.urgency, distance: start.distanceKm ? String(start.distanceKm) : "", returnTrip: start.returnTrip, extraStops: String(start.extraStops || ""), wait: String(start.waitMinutes || ""),
    when: start.whenLocal, size: start.sizeClass, weight: start.weightKg ? String(start.weightKg) : "", rain: start.heavyRain, thirdParty: start.thirdPartyInr ? String(start.thirdPartyInr) : "", thirdPartyNote: start.thirdPartyNote ?? "",
    value: start.declaredValueInr ? String(start.declaredValueInr) : "", prohibited: start.prohibitedItem, pickupPin: start.pickupPincode ?? "", dropPin: start.dropPincode ?? "",
    work: start.workMinutes ? String(start.workMinutes) : "", travel: "",
  });
  const [estimate, setEstimate] = useState(false);
  const [coords, setCoords] = useState({ aLat: "", aLng: "", bLat: "", bLng: "" });
  const [from, setFrom] = useState(preset?.from ?? "");
  const [to, setTo] = useState(preset?.to ?? "");
  const hasRate = (c: string) => fx.some((x) => x.currency === c);
  const [currency, setCurrency] = useState<string>(customerCurrency && hasRate(customerCurrency) ? customerCurrency : "INR");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start_] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const usdPerInr = fx.find((x) => x.currency === "USD")?.perInr;
  const input: PriceInput = useMemo(() => ({
    service: f.service, distanceKm: n(f.distance), distanceIsEstimate: estimate, returnTrip: f.returnTrip, extraStops: Math.floor(n(f.extraStops)), waitMinutes: n(f.wait), urgency: f.urgency, whenLocal: f.when,
    sizeClass: f.size, weightKg: n(f.weight), heavyRain: f.rain, thirdPartyInr: n(f.thirdParty), thirdPartyNote: f.thirdPartyNote, declaredValueInr: n(f.value), prohibitedItem: f.prohibited,
    pickupPincode: f.pickupPin, dropPincode: f.dropPin,
    workMinutes: n(f.work), travelMinutesOverride: f.travel.trim() === "" ? undefined : n(f.travel), usdPerInr,
  }), [f, estimate, usdPerInr]);
  const result = useMemo(() => calculatePrice(input, card), [input, card]);
  const shares = costShares(result);
  const total = Math.round(result.totalPaise / 100);
  const rate = fx.find((x) => x.currency === currency);
  const ask = details ? missingDetails(details, card) : [];

  function fromCoords() {
    const a = { lat: Number(coords.aLat), lng: Number(coords.aLng) };
    const b = { lat: Number(coords.bLat), lng: Number(coords.bLng) };
    if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite) || [coords.aLat, coords.aLng, coords.bLat, coords.bLng].some((x) => x.trim() === "")) return setMsg({ ok: false, text: "Enter both points as latitude and longitude, for example 19.0596 and 72.8295." });
    const km = roadKm(straightLineKm(a, b), card.roadFactor);
    set("distance", String(km));
    setEstimate(true);
    setMsg({ ok: true, text: `About ${km} km by road (straight line times ${card.roadFactor}). Check the route in Maps.` });
  }

  function use() {
    if (!requestId || !result.ok) return;
    setMsg(null);
    start_(async () => {
      const r = await saveEstimateAction(requestId, input, currency, from, to);
      if (r.ok) { setMsg({ ok: true, text: `Saved with rate card version ${r.rateCardVersion}. It is in the quotation form below.` }); onUse?.(r); }
      else setMsg({ ok: false, text: r.message });
    });
  }
  function askNow() {
    if (!requestId) return;
    setMsg(null);
    start_(async () => { const r = await askCustomerAction(requestId); setMsg({ ok: !!r?.ok, text: r?.message ?? "That did not send." }); });
  }

  const field = (label: string, el: React.ReactNode, wide = false) => <label className={`field ${wide ? "sm:col-span-2" : ""}`}>{label}{el}</label>;

  return (
    <section aria-labelledby="calc-title" className="card grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="calc-title" className="text-[length:var(--text-h2)] font-bold">Price calculator</h2>
          <p className="text-[length:var(--text-small)] text-muted">Mumbai only, on electric vehicles. Rate card version {version === 0 ? "0 (starting values)" : version}.</p>
        </div>
        {version === 0 && <p className="chip whitespace-normal" data-tone="warn">These are starting values, not real trip costs. An admin should set them on the Pricing page first.</p>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
        <div className="grid content-start gap-4">
          {ask.length > 0 && (
            <div className="grid gap-2 rounded-xl p-3" style={{ background: "var(--warn-bg)" }}>
              <p className="font-semibold">The customer has not told us yet:</p>
              <ul className="list-disc pl-5 text-[length:var(--text-small)]">{ask.map((a) => <li key={a}>{a}</li>)}</ul>
              {requestId && <button type="button" className="btn btn-secondary w-fit" disabled={pending} onClick={askNow}>Ask the customer for these</button>}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {field("What is the job?", <select className="input" value={f.service} onChange={(e) => set("service", e.target.value as PriceInput["service"])}>{SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}</select>, true)}
            {field("How soon?", <select className="input" value={f.urgency} onChange={(e) => set("urgency", e.target.value as PriceInput["urgency"])}>{URGENCIES.map((u) => <option key={u} value={u}>{URGENCY_LABEL[u]} (x{card.urgencyMultiplier[u]})</option>)}</select>)}
            {field("When (Mumbai time)", <input className="input" type="datetime-local" value={f.when} onChange={(e) => set("when", e.target.value)} />)}
            {field("Pickup PIN code", <input className="input" inputMode="numeric" maxLength={6} value={f.pickupPin} onChange={(e) => set("pickupPin", e.target.value.replace(/\D/g, ""))} />)}
            {f.service === "delivery" && field("Drop PIN code", <input className="input" inputMode="numeric" maxLength={6} value={f.dropPin} onChange={(e) => set("dropPin", e.target.value.replace(/\D/g, ""))} />)}
          </div>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 px-1 font-semibold">Distance</legend>
            {field("Road distance, one way (km)", <input className="input" inputMode="decimal" value={f.distance} onChange={(e) => { set("distance", e.target.value); setEstimate(false); }} />)}
            <div className="grid content-end gap-2">
              <label className="choice"><input type="checkbox" className="size-5" checked={f.returnTrip} onChange={(e) => set("returnTrip", e.target.checked)} /><span>There and back</span></label>
            </div>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
              {field("From (for the map link)", <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Area or address" />)}
              {f.service === "delivery" && field("To", <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Area or address" />)}
              {from && (to || f.service !== "delivery") && <a className="btn btn-secondary" href={mapsRouteLink(from, to || from)} target="_blank" rel="noopener noreferrer">Check the route in Maps</a>}
            </div>
            <details className="sm:col-span-2">
              <summary className="min-h-12 cursor-pointer py-3 text-[length:var(--text-small)] font-semibold text-accent">Or estimate from two map points</summary>
              <div className="grid gap-2 sm:grid-cols-4">
                {(["aLat", "aLng", "bLat", "bLng"] as const).map((k) => <label key={k} className="field">{{ aLat: "Start latitude", aLng: "Start longitude", bLat: "End latitude", bLng: "End longitude" }[k]}<input className="input" inputMode="decimal" value={coords[k]} onChange={(e) => setCoords({ ...coords, [k]: e.target.value })} /></label>)}
              </div>
              <button type="button" className="btn btn-secondary mt-2" onClick={fromCoords}>Estimate the road distance</button>
            </details>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 px-1 font-semibold">Time</legend>
            {field("Work at the place (minutes)", <input className="input" inputMode="numeric" value={f.work} onChange={(e) => set("work", e.target.value)} />)}
            {field("Travel time by hand (minutes, optional)", <input className="input" inputMode="numeric" value={f.travel} onChange={(e) => set("travel", e.target.value)} placeholder={`Worked out: about ${Math.round((n(f.distance) * (f.returnTrip ? 2 : 1) / Math.max(1, card.avgSpeedKmh)) * 60)}`} />)}
            {card.pricingMode === "time" && <p className="text-[length:var(--text-micro)] text-muted sm:col-span-2">Every {card.timeBlockMinutes} minutes of travelling, handover, work and waiting is charged at ${card.timeBlockUsd}. A part of a block counts as a whole one.</p>}
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 px-1 font-semibold">The load</legend>
            {field("Size", <select className="input" value={f.size} onChange={(e) => set("size", e.target.value as PriceInput["sizeClass"])}>{SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}</select>)}
            {field("Weight (kg)", <input className="input" inputMode="decimal" value={f.weight} onChange={(e) => set("weight", e.target.value)} />)}
            {field("Declared value (Rs)", <input className="input" inputMode="numeric" value={f.value} onChange={(e) => set("value", e.target.value)} />)}
            <label className="choice self-end"><input type="checkbox" className="size-5" checked={f.prohibited} onChange={(e) => set("prohibited", e.target.checked)} /><span>On the not-carried list</span></label>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-1 px-1 font-semibold">Extras</legend>
            {field("Extra stops", <input className="input" inputMode="numeric" value={f.extraStops} onChange={(e) => set("extraStops", e.target.value)} />)}
            {field("Waiting (minutes)", <input className="input" inputMode="numeric" value={f.wait} onChange={(e) => set("wait", e.target.value)} />)}
            <label className="choice self-end"><input type="checkbox" className="size-5" checked={f.rain} onChange={(e) => set("rain", e.target.checked)} /><span>Heavy rain</span></label>
            {field("Provider, materials or fees at cost (Rs)", <input className="input" inputMode="decimal" value={f.thirdParty} onChange={(e) => set("thirdParty", e.target.value)} />, true)}
            {field("What that covers", <input className="input" maxLength={200} value={f.thirdPartyNote} onChange={(e) => set("thirdPartyNote", e.target.value)} />, true)}
          </fieldset>
        </div>

        <div className="grid content-start gap-4 xl:sticky xl:top-4" aria-live="polite">
          {result.blockers.length > 0 && (
            <div role="alert" className="grid gap-1 rounded-xl p-3" style={{ background: "var(--danger-bg)" }}>
              <p className="font-semibold text-danger">We cannot price this yet</p>
              <ul className="list-disc pl-5 text-[length:var(--text-small)]">{result.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          )}
          {result.warnings.length > 0 && (
            <ul className="grid gap-1 rounded-xl p-3 text-[length:var(--text-small)]" style={{ background: "var(--warn-bg)" }}>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}

          {result.mode === "time" && result.time && (
            <div className="grid gap-2 rounded-2xl border border-line p-4">
              <h3 className="font-semibold">How the time adds up</h3>
              <ul className="grid gap-0.5 text-[length:var(--text-small)]">
                {([["Travelling", result.time.travelMin], ["At the places (parking and handover)", result.time.handlingMin], ["The work itself", result.time.workMin], ["Waiting", result.time.waitMin]] as const).filter(([, v]) => v > 0).map(([k, v]) => <li key={k} className="flex justify-between gap-3"><span className="text-muted">{k}</span><span className="tabular-nums">{v} min</span></li>)}
                <li className="flex justify-between gap-3 border-t border-line pt-1 font-semibold"><span>Total time</span><span className="tabular-nums">{result.time.totalMin} min</span></li>
              </ul>
              <p className="text-[length:var(--text-small)]">That is {result.time.blocks} block{result.time.blocks === 1 ? "" : "s"} of {result.time.blockMinutes} minutes at ${result.time.blockUsd}: <strong>{formatMoney(result.time.blocks * result.time.blockUsd, "USD")}</strong>, or {rs((result.time.blocks * result.time.blockPaise) / 100)}{usdPerInr ? ` at 1 USD = ${rs(1 / usdPerInr)}` : ""}.</p>
              {result.timeLines && result.timeLines.length > 0 && (
                <ul className="grid gap-0.5 border-l-2 border-line pl-3 text-[length:var(--text-small)]">
                  {result.timeLines.map((l) => <li key={l.key} className="flex justify-between gap-3"><span className="text-muted [overflow-wrap:anywhere]">{l.label}</span><span className="tabular-nums">{rs(l.paise / 100)}</span></li>)}
                </ul>
              )}
              {result.fair && (
                <div className="grid gap-1 rounded-xl bg-sunken p-3 text-[length:var(--text-small)]">
                  <p className="font-semibold">Fair price check {result.fair.floorApplied && <span className="chip ml-1" data-tone="warn">Raised to the floor</span>}</p>
                  <p className="text-muted">The rider and vehicle plus our {card.feePct}% fee come to {rs(result.fair.costPlusServicePaise / 100)}. The time price is {rs(result.fair.timeServicePaise / 100)}, which is {result.fair.ratio} times that. Ally keeps {result.fair.allyShareOfServicePct}% of the service price after paying the rider and the vehicle.</p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Where the money goes">
            {([["To the rider", shares.rider], ["EV cost to us", shares.ev], ["Provider at cost", shares.thirdParty], ["Our fee", shares.ally]] as const).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-sunken p-3"><p className="text-[length:var(--text-micro)] text-muted">{k}</p><p className="text-[length:var(--text-h3)] font-bold tabular-nums">{rs(v)}</p></div>
            ))}
          </div>

          <div className="grid gap-3">
            {GROUPS.map((g) => {
              const items = result.lines.filter((l) => l.group === g.key);
              if (items.length === 0) return null;
              const sub = items.reduce((s, l) => s + l.paise, 0);
              return (
                <div key={g.key} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-3"><h3 className="font-semibold">{g.title}<span className="ml-2 text-[length:var(--text-micro)] font-normal text-muted">{g.hint}</span></h3><span className="font-semibold tabular-nums">{rs(sub / 100)}</span></div>
                  <ul className="grid gap-0.5 border-l-2 border-line pl-3 text-[length:var(--text-small)]">
                    {items.map((l) => <li key={l.key} className="flex justify-between gap-3"><span className="text-muted [overflow-wrap:anywhere]">{l.label}{l.note ? ` (${l.note})` : ""}</span><span className="tabular-nums">{rs(l.paise / 100)}</span></li>)}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="grid gap-1 rounded-2xl p-4" style={{ background: "var(--mint)" }}>
            <div className="flex items-baseline justify-between gap-3"><p className="font-semibold">The customer pays, in full, in advance</p><div className="text-right"><p className="text-[length:var(--text-h1)] font-bold tabular-nums">{result.ok ? rs(total) : "Not yet"}</p>{result.ok && result.totalUsd != null && <p className="text-[length:var(--text-h3)] font-semibold tabular-nums">{formatMoney(result.totalUsd, "USD")}</p>}</div></div>
            {result.ok && result.mode === "time" && <p className="text-[length:var(--text-small)] text-muted">Our costs are {rs(result.costsPaise / 100)}: the rider, the vehicle and any provider. Ally keeps {rs(shares.ally)}, which is {result.feeShareOfTotalPct}% of what the customer pays.</p>}
            {result.ok && result.mode === "cost" && <p className="text-[length:var(--text-small)] text-muted">Our cost {rs(result.costsPaise / 100)}. Our fee {rs(shares.ally)}, which is {result.feeShareOfTotalPct}% of what the customer pays and {card.feePct}% {card.feeBasis === "on_costs" ? "on top of costs" : "of the price"}.</p>}
            {result.ok && currency !== "INR" && currency !== "USD" && rate && <p className="text-[length:var(--text-small)]">About {formatMoney(convertInr(total, rate.perInr, card.fxBufferPct), currency)} at 1 {currency} = {rs(1 / rate.perInr)}{card.fxBufferPct > 0 ? `, including a ${card.fxBufferPct}% conversion buffer` : ""}.</p>}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {fx.length > 0 && (
              <label className="field">Show the customer&apos;s price in
                <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="INR">Rupees only</option>
                  {fx.map((x) => <option key={x.currency} value={x.currency}>{x.currency}</option>)}
                </select>
              </label>
            )}
            {requestId && <button type="button" className="btn btn-primary" disabled={!result.ok || pending} onClick={use}>{pending ? "Saving..." : "Use this price in the quotation"}</button>}
          </div>
          <p role="status" aria-live="polite" className={msg?.ok ? "text-ok" : "text-danger"}>{msg?.text}</p>
          {result.assumptions.length > 0 && <ul className="list-disc pl-5 text-[length:var(--text-micro)] text-muted">{result.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>}
        </div>
      </div>
    </section>
  );
}
