"use client";

import { useState } from "react";
import { DEFAULT_RATE_CARD, isInServiceArea, SIZE_LABEL, SIZES, URGENCIES, URGENCY_LABEL, type RequestDetails, type Service } from "@/lib/pricing-rules";

const SERVICE_CHOICES: [Service, string][] = [
  ["visit", "Go to one place (a visit, a check, collect something)"],
  ["delivery", "Pick something up and drop it somewhere"],
  ["errand", "Arrange something with a provider"],
];

function PinHint({ pin, area }: { pin: string; area: { from: number; to: number } }) {
  const ok = isInServiceArea(pin, { areaPinFrom: area.from, areaPinTo: area.to });
  if (ok !== false) return null;
  return <span role="status" className="font-normal text-warn">This PIN code is outside Mumbai. We only work in Mumbai for now, so your coordinator will talk to you before anything starts.</span>;
}

function PlaceFields({ prefix, title, init, area }: { prefix: "p" | "d"; title: string; init: RequestDetails["pickup"]; area: { from: number; to: number } }) {
  const [pin, setPin] = useState(init.pincode);
  const n = (k: string) => `${prefix}_${k}`;
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-1 px-1 font-semibold">{title}</legend>
      <label className="field sm:col-span-2">Address<input className="input" name={n("address")} maxLength={300} defaultValue={init.address} autoComplete="off" placeholder="Building, street and landmark" /></label>
      <label className="field">Area<input className="input" name={n("area")} maxLength={80} defaultValue={init.area} placeholder="For example Bandra West" /></label>
      <label className="field">PIN code<input className="input" name={n("pincode")} inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="6 digits" /><PinHint pin={pin} area={area} /></label>
      <label className="field">Name of someone there<input className="input" name={n("contactName")} maxLength={80} defaultValue={init.contactName} /></label>
      <label className="field">Their phone<input className="input" name={n("contactPhone")} inputMode="tel" maxLength={30} defaultValue={init.contactPhone} /></label>
      <label className="field sm:col-span-2">How do we get in? (optional)<input className="input" name={n("access")} maxLength={200} defaultValue={init.access} placeholder="Gate, security desk, floor, lift" /></label>
    </fieldset>
  );
}

/**
 * Everything we ask so the price can be honest: where, how soon, and what is being carried.
 * Used when sending a request and again on the request page, so a missing detail can be added later.
 */
export function DetailsFields({ initial, area = { from: DEFAULT_RATE_CARD.areaPinFrom, to: DEFAULT_RATE_CARD.areaPinTo }, defaultOpen = false }: { initial: RequestDetails; area?: { from: number; to: number }; defaultOpen?: boolean }) {
  const [service, setService] = useState<Service>(initial.service);
  const delivering = service === "delivery";
  return (
    <details className="card grid gap-4" open={defaultOpen}>
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 font-semibold">
        <span>Where and when<span className="block text-[length:var(--text-small)] font-normal text-muted">Mumbai only for now. These details let us price it honestly.</span></span>
      </summary>
      <div className="grid gap-5">
        <fieldset className="grid gap-2">
          <legend className="mb-1 px-1 font-semibold">How soon do you need it?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {URGENCIES.map((u) => (
              <label key={u} className="choice"><input type="radio" name="urgency" value={u} defaultChecked={initial.urgency === u} className="size-5" /><span>{URGENCY_LABEL[u]}</span></label>
            ))}
          </div>
          <p className="text-[length:var(--text-micro)] text-muted">Faster work costs more, because a rider has to be freed up. The price shows this as its own line.</p>
        </fieldset>

        <label className="field">What should we do?
          <select className="input" name="service" value={service} onChange={(e) => setService(e.target.value as Service)}>
            {SERVICE_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>

        <PlaceFields prefix="p" title={delivering ? "Pick up from" : "The place we should go to"} init={initial.pickup} area={area} />
        {delivering && <PlaceFields prefix="d" title="Drop at" init={initial.drop} area={area} />}

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 px-1 font-semibold">When suits you?</legend>
          <label className="field">Day<input className="input" type="date" name="w_date" defaultValue={initial.window.date} /></label>
          <label className="field">Earliest time<input className="input" type="time" name="w_from" defaultValue={initial.window.from} /></label>
          <label className="field">Latest time<input className="input" type="time" name="w_to" defaultValue={initial.window.to} /></label>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 px-1 font-semibold">{delivering ? "What are we carrying?" : "Anything we need to carry? (optional)"}</legend>
          <label className="field sm:col-span-2">In a few words<input className="input" name="i_what" maxLength={200} defaultValue={initial.item.what} placeholder="For example a passport file" /></label>
          <label className="field">Size
            <select className="input" name="i_size" defaultValue={initial.item.size}>{SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}</select>
          </label>
          <label className="field">Weight in kg<input className="input" name="i_weight" inputMode="decimal" defaultValue={initial.item.weightKg || ""} /></label>
          <label className="field">Worth about (Rs)<input className="input" name="i_value" inputMode="numeric" defaultValue={initial.item.valueInr || ""} /></label>
          <label className="choice self-end"><input type="checkbox" name="i_fragile" defaultChecked={initial.item.fragile} className="size-5" /><span>It can break</span></label>
          <p className="text-[length:var(--text-micro)] text-muted sm:col-span-2">We cannot carry cash, jewellery or anything illegal or dangerous. Items must fit on an electric scooter and weigh under 15 kg.</p>
        </fieldset>

        <label className="choice"><input type="checkbox" name="returnTrip" defaultChecked={initial.returnTrip} className="size-5" /><span>Bring something back, or return to where we started</span></label>
        <label className="field">Anything else we should know? (optional)<textarea className="input" name="notes" rows={2} maxLength={500} defaultValue={initial.notes} /></label>
      </div>
    </details>
  );
}
