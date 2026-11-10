export const dynamic = "force-dynamic";

import { AddPartnerForm, PartnerActions, PartnerFeedbackForm } from "@/components/OpsForms";
import { Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { partners } from "@/lib/ops-console";
import { PARTNER_STATUSES } from "@/lib/workspace-rules";

export const metadata = { title: "Service Partners" };

export default async function Partners() {
  const viewer = await requireStaff();
  const list = await partners();
  return (
    <section className="grid gap-5">
      <PageHeader title="Service Partners" sub="A status is only earned by the check before it, recorded with who did it and when. Only partners approved for use can be assigned from the directory." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="grid gap-3">
          {list.length === 0 && <Empty title="No service partners yet.">Add local partners as you work with them. They start as not reviewed.</Empty>}
          {list.map((p) => {
            const s = PARTNER_STATUSES[p.status];
            return (
              <article key={p.id} className="card grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{p.name}</h2><span className="chip" data-tone={s.tone}>{s.label}</span></div>
                <p className="text-[length:var(--text-small)] text-muted">{p.category}{p.city ? ` · ${p.city}` : ""}{p.phone ? ` · ${p.phone}` : ""}{p.email ? ` · ${p.email}` : ""} · {p.jobs} job{p.jobs === 1 ? "" : "s"}</p>
                {p.availability && <p className="text-[length:var(--text-small)]">Availability: {p.availability}</p>}
                {p.notes && <p className="text-[length:var(--text-small)] text-muted [overflow-wrap:anywhere]">{p.notes}</p>}
                {viewer.role === "admin" && <PartnerActions id={p.id} name={p.name} status={p.status} />}
                {p.feedback.length > 0 && <ul className="rows">{p.feedback.slice(0, 5).map((f, i) => <li key={i} className="py-2 text-[length:var(--text-small)] [overflow-wrap:anywhere]">{f.body}<span className="block text-[length:var(--text-micro)] text-muted">{f.author} · {fmtDate(f.at)}</span></li>)}</ul>}
                <PartnerFeedbackForm partnerId={p.id} />
              </article>
            );
          })}
        </div>
        <AddPartnerForm />
      </div>
    </section>
  );
}
