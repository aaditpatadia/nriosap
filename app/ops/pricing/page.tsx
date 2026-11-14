import { FxPanel, RateCardForm } from "@/components/RateCardForm";
import { PricingCalculator } from "@/components/PricingCalculator";
import { PageHeader, Panel } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { activeRateCard, fxRates, rateCardHistory } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing" };

export default async function OpsPricing() {
  const viewer = await requireStaff();
  const [rc, fx, history] = await Promise.all([activeRateCard(), fxRates(), rateCardHistory()]);
  const canEdit = viewer.role === "admin";
  return (
    <section className="grid gap-5">
      <PageHeader title="Pricing" sub="Work out an honest price for Mumbai jobs on electric vehicles. Customers pay the full amount before the work starts." />
      <PricingCalculator card={rc.card} version={rc.version} fx={fx.map((x) => ({ currency: x.currency, perInr: x.perInr, asOf: x.asOf }))} />
      <RateCardForm card={rc.card} version={rc.version} canEdit={canEdit} />
      <FxPanel rates={fx} canEdit={canEdit} />
      {history.length > 0 && (
        <Panel title="Rate card history">
          <ul className="rows">{history.map((h) => <li key={h.version} className="flex flex-wrap justify-between gap-2 py-2 text-[length:var(--text-small)]"><span><span className="font-semibold">Version {h.version}</span> {h.note ? `. ${h.note}` : ""}</span><span className="text-muted">{h.by ?? "Unknown"}, {fmtDate(h.createdAt)}</span></li>)}</ul>
        </Panel>
      )}
    </section>
  );
}
