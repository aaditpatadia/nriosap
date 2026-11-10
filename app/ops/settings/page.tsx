export const dynamic = "force-dynamic";

import Link from "next/link";
import { PlanForm, WorkingHoursForm } from "@/components/OpsForms";
import { PageHeader, Panel } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { one } from "@/lib/db";
import { loadPlans } from "@/lib/plans";

export const metadata = { title: "Settings" };

export default async function OpsSettings() {
  const viewer = await requireStaff();
  const admin = viewer.role === "admin";
  const [plans, me] = await Promise.all([admin ? loadPlans() : [], one<{ working_hours: string | null }>("select working_hours from profiles where id = $1", [viewer.id])]);
  const tools: [string, string, string][] = [["/ops/partners", "Service partners", "The directory of local partners, and their checks."], ["/ops/reports", "Reports", "Hours, margin and SLA per family."], ...(admin ? [["/ops/coordinators", "Coordinators", "Workload for each coordinator, as plain counts."] as [string, string, string]] : [])];
  return (
    <section className="grid max-w-4xl gap-5">
      <PageHeader title="Settings" />
      <Panel title="Your working hours"><p className="text-[length:var(--text-small)] text-muted">Customers see this next to your name. Write it as you would say it, for example: Monday to Saturday, 9 am to 7 pm India time.</p><WorkingHoursForm current={me?.working_hours ?? ""} /></Panel>
      <Panel title="Desk tools"><ul className="rows">{tools.map(([href, label, help]) => <li key={href}><Link className="row-link" href={href}><span><span className="block font-medium">{label}</span><span className="block text-[length:var(--text-small)] text-muted">{help}</span></span><span aria-hidden className="text-muted">›</span></Link></li>)}</ul></Panel>
      {admin && (
        <>
          <h2 className="section-title">Plans and entitlements</h2>
          <p className="text-[length:var(--text-small)] text-muted">What you set here is what the website shows and what the product enforces. If you change a price, the matching Stripe price must be changed too.</p>
          {plans.map((p) => <PlanForm key={p.slug} plan={p} />)}
        </>
      )}
    </section>
  );
}
