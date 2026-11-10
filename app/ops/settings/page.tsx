export const dynamic = "force-dynamic";

import { PlanForm } from "@/components/OpsForms";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { loadPlans } from "@/lib/plans";

export const metadata = { title: "Settings" };

export default async function OpsSettings() {
  await requireAdmin();
  const plans = await loadPlans();
  return (
    <section className="grid max-w-4xl gap-4">
      <PageHeader title="Plans and entitlements" sub="What you set here is what the website shows and what the product enforces. If you change a price, the matching Stripe price must be changed too." />
      {plans.map((p) => <PlanForm key={p.slug} plan={p} />)}
    </section>
  );
}
