import { notFound } from "next/navigation";
import { BillingButtons } from "@/components/PrivacyControls";
import { getViewer } from "@/lib/auth";
import { billingConfigured, subscriptionFor } from "@/lib/billing";
import { PLAN_NAME } from "@/lib/consent";
import { getFamily } from "@/lib/store";
import { fmtDate } from "@/lib/format";

const STATUS: Record<string, string> = { active: "Active", trialing: "Trial", past_due: "Payment overdue", canceled: "Cancelled", none: "Not started" };

export default async function Billing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [sub, viewer] = await Promise.all([subscriptionFor(id), getViewer()]);
  const owner = viewer?.id === fam.owner.id;
  const status = sub?.status ?? "none";
  return (
    <section className="grid gap-4 lg:grid-cols-2 lg:items-start [&>h1]:lg:col-span-2 [&>p]:lg:col-span-2">
      <h1 className="text-[length:var(--text-h1)] font-bold">Billing</h1>
      {sp.done && <p role="status" className="card text-ok">Thank you. Your subscription will show here in a moment.</p>}
      <div className="card grid gap-1">
        <p className="text-[length:var(--text-h3)] font-semibold">{PLAN_NAME[fam.planUsd] ?? "Plan"}: ${fam.planUsd} a month</p>
        <p className="text-muted">Status: {STATUS[status] ?? status}{sub?.currentPeriodEnd ? ` · next charge ${fmtDate(sub.currentPeriodEnd)}` : ""}{sub?.cancelAtPeriodEnd ? " · ends at period end" : ""}</p>
        <p className="text-muted">Started {fmtDate(fam.startedAt)}. Cancel any time. No lock-in, no visit caps.</p>
      </div>
      {owner && billingConfigured(fam.planUsd) && <BillingButtons familyId={id} hasSubscription={!!sub?.hasCustomer && status !== "canceled"} />}
      <p className="text-[length:var(--text-small)] text-muted">This is only for your Gharsaath subscription. We never handle money for your parents&apos; bills or claims. Those need your approval and, in future, a licensed partner.</p>
    </section>
  );
}
