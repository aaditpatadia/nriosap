import { notFound } from "next/navigation";
import { BillingButtons } from "@/components/PrivacyControls";
import { getViewer } from "@/lib/auth";
import { billingConfigured, subscriptionFor } from "@/lib/billing";
import { planForPrice, requestsLeft } from "@/lib/plan-rules";
import { loadPlans } from "@/lib/plans";
import { asService, one } from "@/lib/db";
import { monthStartIst } from "@/lib/rules";
import { getFamily } from "@/lib/store";
import { fmtDate } from "@/lib/format";

const STATUS: Record<string, string> = { active: "Active", trialing: "Trial", past_due: "Payment overdue", canceled: "Cancelled", none: "Not started" };

export default async function Billing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [sub, viewer, plans, used] = await Promise.all([subscriptionFor(id), getViewer(), loadPlans(), asService(() => one<{ n: number }>("select count(*)::int as n from service_requests where family_id = $1 and created_at >= $2", [id, monthStartIst(new Date())]))]);
  const plan = planForPrice(fam.planUsd, plans);
  const left = requestsLeft(plan, used?.n ?? 0);
  const owner = viewer?.id === fam.owner.id;
  const status = sub?.status ?? "none";
  return (
    <section className="grid gap-4 lg:grid-cols-2 lg:items-start [&>h1]:lg:col-span-2 [&>p]:lg:col-span-2">
      <h1 className="text-[length:var(--text-h1)] font-bold">Plan and billing</h1>
      {sp.done && <p role="status" className="card text-ok">Thank you. Your subscription will show here in a moment.</p>}
      <div className="card grid gap-1">
        <p className="text-[length:var(--text-h3)] font-semibold">{plan.name}: ${fam.planUsd} a month</p>
        <p className="text-muted">Status: {STATUS[status] ?? status}{sub?.currentPeriodEnd ? ` · next charge ${fmtDate(sub.currentPeriodEnd)}` : ""}{sub?.cancelAtPeriodEnd ? " · ends at period end" : ""}</p>
        <p className="text-muted">Started {fmtDate(fam.startedAt)}. Cancel any time. No lock-in.</p>
        <p className="text-muted">{left === null ? "No monthly limit on new requests." : `${left} of ${plan.requestsPerMonth} new requests left this month.`} {plan.includesVisits ? "In-person visits are arranged within your plan." : "In-person visits are quoted before they happen."}</p>
        <ul className="mt-2 grid gap-1 text-[length:var(--text-small)]">{plan.features.map((f) => <li key={f}>{f}</li>)}</ul>
      </div>
      {owner && billingConfigured(fam.planUsd) && <BillingButtons familyId={id} hasSubscription={!!sub?.hasCustomer && status !== "canceled"} />}
      <p className="text-[length:var(--text-small)] text-muted">This is only for your Ally subscription. Third-party costs such as provider fees and government charges are quoted separately for your approval. We never hold your money.</p>
    </section>
  );
}
