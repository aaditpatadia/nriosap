"use client";

import { useActionState } from "react";
import { saveRateCardAction, refreshFxAction, setFxAction } from "@/app/ops/pricing-actions";
import { CURRENCIES, URGENCIES, URGENCY_LABEL, SIZES, SIZE_LABEL, type RateCard } from "@/lib/pricing-rules";
import { fmtDate } from "@/lib/format";
import { useState, useTransition } from "react";

const Status = ({ s }: { s: { ok: boolean; message: string } | null }) => <p role="status" aria-live="polite" className={s?.ok ? "text-ok" : "text-danger"}>{s?.message}</p>;

function Num({ name, label, value, help, step = "any" }: { name: string; label: string; value: number; help?: string; step?: string }) {
  return <label className="field">{label}<input className="input" name={name} type="number" step={step} defaultValue={value} required />{help && <span className="text-[length:var(--text-micro)] font-normal text-muted">{help}</span>}</label>;
}

/** Every rate the calculator uses. Saving makes a new version, so an old price can always be explained. */
export function RateCardForm({ card, version, canEdit }: { card: RateCard; version: number; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveRateCardAction, null);
  return (
    <form action={action} className="card grid gap-5">
      <div><h2 className="text-[length:var(--text-h2)] font-bold">Rate card</h2><p className="text-[length:var(--text-small)] text-muted">Version {version === 0 ? "0, the starting values" : version}. {canEdit ? "Saving makes a new version. Old prices keep the rates they used." : "Only an admin can change these."}</p></div>
      <fieldset disabled={!canEdit} className="grid gap-5">
        <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-1 px-1 font-semibold">Rider pay</legend>
          <Num name="riderBaseInr" label="Per task (Rs)" value={card.riderBaseInr} />
          <Num name="riderPerKmInr" label="Per km (Rs)" value={card.riderPerKmInr} />
          <Num name="extraStopInr" label="Per extra stop (Rs)" value={card.extraStopInr} />
          <Num name="freeWaitMinutes" label="Free waiting (minutes)" value={card.freeWaitMinutes} />
          <Num name="riderWaitPerMinInr" label="Waiting per minute (Rs)" value={card.riderWaitPerMinInr} />
          <Num name="heavyRainBonusInr" label="Heavy rain bonus (Rs)" value={card.heavyRainBonusInr} />
          <Num name="nightUpliftPct" label="Night extra (%)" value={card.nightUpliftPct} />
          <Num name="nightFromHour" label="Night starts (hour, 0 to 23)" value={card.nightFromHour} step="1" />
          <Num name="nightToHour" label="Night ends (hour, 0 to 23)" value={card.nightToHour} step="1" />
          <Num name="sundayUpliftPct" label="Sunday extra (%)" value={card.sundayUpliftPct} />
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-4"><legend className="mb-1 px-1 font-semibold">How soon: multiplier on rider pay</legend>
          {URGENCIES.map((u) => <Num key={u} name={`urg_${u}`} label={URGENCY_LABEL[u]} value={card.urgencyMultiplier[u]} />)}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-4"><legend className="mb-1 px-1 font-semibold">Item size: extra per trip (Rs)</legend>
          {SIZES.map((s) => <Num key={s} name={`size_${s}`} label={SIZE_LABEL[s]} value={card.sizeSurchargeInr[s]} />)}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-1 px-1 font-semibold">Electric vehicle cost to us</legend>
          <Num name="evEnergyPerKmInr" label="Charging per km (Rs)" value={card.evEnergyPerKmInr} />
          <Num name="evMaintenancePerKmInr" label="Upkeep and battery per km (Rs)" value={card.evMaintenancePerKmInr} />
          <Num name="evPerTaskOverheadInr" label="Insurance, phone and kit per task (Rs)" value={card.evPerTaskOverheadInr} />
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-1 px-1 font-semibold">Our fee, tax and the total</legend>
          <Num name="feePct" label="Ally fee (%)" value={card.feePct} />
          <label className="field">The fee is taken
            <select className="input" name="feeBasis" defaultValue={card.feeBasis}><option value="on_costs">On top of costs (25% of costs)</option><option value="of_total">As a share of the price (25% of what the customer pays)</option></select>
          </label>
          <Num name="minFeeInr" label="Smallest fee (Rs)" value={card.minFeeInr} />
          <Num name="taxPct" label="Tax (%), as set by your accountant" value={card.taxPct} help="Leave at 0 until your accountant gives you the rate." />
          <label className="field">Tax is charged on
            <select className="input" name="taxBasis" defaultValue={card.taxBasis}><option value="ally_fee">Ally&apos;s fee only</option><option value="all">The whole price</option></select>
          </label>
          <Num name="minTotalInr" label="Smallest total (Rs)" value={card.minTotalInr} />
          <Num name="roundToInr" label="Round up to the next (Rs)" value={card.roundToInr} step="1" />
          <Num name="fxBufferPct" label="Currency conversion buffer (%)" value={card.fxBufferPct} help="Shown to the customer if above 0." />
          <Num name="quoteValidHours" label="A quotation stays valid (hours)" value={card.quoteValidHours} />
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-1 px-1 font-semibold">Limits and the service area</legend>
          <Num name="evMaxRouteKm" label="Longest trip for an EV, one way (km)" value={card.evMaxRouteKm} />
          <Num name="evMaxWeightKg" label="Heaviest load (kg)" value={card.evMaxWeightKg} />
          <Num name="highValueInr" label="Ask a second person above (Rs)" value={card.highValueInr} />
          <Num name="roadFactor" label="Road distance over straight line" value={card.roadFactor} />
          <Num name="areaPinFrom" label="Service area: first PIN code" value={card.areaPinFrom} step="1" />
          <Num name="areaPinTo" label="Service area: last PIN code" value={card.areaPinTo} step="1" />
        </fieldset>
        {canEdit && (
          <>
            <label className="field">Why are you changing the rates?<input className="input" name="note" maxLength={200} required placeholder="For example: first month of real trips" /></label>
            <button className="btn btn-primary w-fit" disabled={pending}>{pending ? "Saving..." : "Save as a new version"}</button>
          </>
        )}
      </fieldset>
      <Status s={state} />
    </form>
  );
}

export function FxPanel({ rates, canEdit }: { rates: { currency: string; perInr: number; asOf: string; source: string }[]; canEdit: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, go] = useTransition();
  const [state, action, setting] = useActionState(setFxAction, null);
  return (
    <section className="card grid gap-4" aria-labelledby="fx-title">
      <div><h2 id="fx-title" className="text-[length:var(--text-h2)] font-bold">Exchange rates</h2><p className="text-[length:var(--text-small)] text-muted">Used to show a customer their price in their own currency. The price itself is always in rupees.</p></div>
      {rates.length === 0 ? <p className="text-muted">No rates yet. Customers see rupees only until you add them.</p> : (
        <ul className="rows">{rates.map((r) => <li key={r.currency} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[length:var(--text-small)]"><span className="font-semibold">{r.currency}</span><span className="tabular-nums">1 INR = {r.perInr} {r.currency}</span><span className="text-muted">{fmtDate(r.asOf)}, {r.source}</span></li>)}</ul>
      )}
      {canEdit && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => go(async () => setMsg(await refreshFxAction()))}>{pending ? "Getting rates..." : "Get today's rates"}</button>
            <span className="text-[length:var(--text-micro)] text-muted">Rates by <a className="underline" href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Exchange Rate API</a>. Nothing about a customer is sent.</span>
          </div>
          <form action={action} className="flex flex-wrap items-end gap-3">
            <label className="field">Or enter one by hand<select className="input" name="currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="field">Units per 1 rupee<input className="input" name="perInr" inputMode="decimal" placeholder="0.0106" required /></label>
            <button className="btn btn-secondary" disabled={setting}>Save rate</button>
          </form>
          <Status s={state ?? msg} />
        </div>
      )}
    </section>
  );
}
