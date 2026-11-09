import { notFound } from "next/navigation";
import { getFamily } from "@/lib/store";
import { fmtDate } from "@/lib/format";

export default async function Billing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = (await getFamily(id));
  if (!fam) notFound();
  const next = new Date(new Date(fam.startedAt).getTime() + 30 * 86400000 * 2);
  return (
    <section className="grid max-w-xl gap-4">
      <h1 className="text-[length:var(--text-h1)] font-bold">Billing</h1>
      <div className="card grid gap-1">
        <p className="text-[length:var(--text-h3)] font-semibold">{fam.planUsd >= 79 ? "Family" : "Lite"} plan: ${fam.planUsd} a month</p>
        <p className="text-muted">Started {fmtDate(fam.startedAt)} · next charge around {fmtDate(next.toISOString())}</p>
        <p className="text-muted">Cancel any time. No lock-in, no visit caps.</p>
      </div>
      <p className="text-[length:var(--text-small)] text-muted">Display only in this demo. Subscription payments will use a payment provider; task payments to third parties will use a licensed partner after legal review.</p>
    </section>
  );
}
