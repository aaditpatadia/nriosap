"use client";

import { useState } from "react";
import { PricingCalculator, type CalcPreset, type FxOption } from "./PricingCalculator";
import { QuoteForm, type QuotePreset } from "./RequestStaffForms";
import type { Currency, RateCard, RequestDetails } from "@/lib/pricing-rules";

/** The price calculator and the quotation form side by side. Using a price fills the form and links the two. */
export function QuoteDesk({ requestId, providerName, card, version, preset, details, fx, customerCurrency }: {
  requestId: string; providerName: string; card: RateCard; version: number; preset: CalcPreset; details: RequestDetails; fx: FxOption[]; customerCurrency: Currency | null;
}) {
  const [used, setUsed] = useState<QuotePreset | undefined>();
  return (
    <div className="grid gap-4">
      <PricingCalculator
        card={card} version={version} requestId={requestId} preset={preset} details={details} fx={fx} customerCurrency={customerCurrency}
        onUse={(e) => setUsed({ providerFee: e.providerFeeInr, coordinationFee: e.coordinationFeeInr, taxes: e.taxesInr, notes: e.notes, estimateId: e.estimateId, version: e.rateCardVersion })}
      />
      <QuoteForm key={used?.estimateId ?? "manual"} requestId={requestId} providerName={providerName} preset={used} />
    </div>
  );
}
