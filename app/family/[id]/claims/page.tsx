import { notFound } from "next/navigation";
import { ClaimControls, NewClaimForm, RequirementToggle } from "@/components/StaffForms";
import { getViewer, isStaff } from "@/lib/auth";
import { claimsFor, getFamily } from "@/lib/store";
import { fmtShort, inr } from "@/lib/format";

const LABEL = { preparing: "Preparing", submitted: "Submitted", query: "Insurer has a question", approved: "Approved", settled: "Settled" } as const;
const TONE = { preparing: "accent", submitted: "accent", query: "warn", approved: "ok", settled: "ok" } as const;
const STEPS = ["preparing", "submitted", "approved", "settled"] as const;

export default async function Claims({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getFamily(id))) notFound();
  const [claims, viewer] = await Promise.all([claimsFor(id), getViewer()]);
  const staff = isStaff(viewer);
  return (
    <section className="grid gap-4">
      <h1 className="text-[length:var(--text-h1)] font-bold">Claims</h1>
      {claims.length === 0 && <p className="text-muted">No claims yet. If a hospital stay happens, the desk will open one here.</p>}
      {claims.map((c) => {
        const at = c.status === "query" ? 1 : STEPS.indexOf(c.status as (typeof STEPS)[number]);
        const reqs = c.requirements ?? [];
        return (
          <article key={c.id} className="card grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[length:var(--text-h3)] font-semibold">{c.hospital}</h2>
              <span className="chip" data-tone={TONE[c.status]}>{LABEL[c.status]}</span>
            </div>
            <ol className="grid grid-cols-4 gap-1" aria-label="Claim progress">
              {STEPS.map((s, i) => (
                <li key={s} aria-current={i === at ? "step" : undefined}>
                  <div className={`h-1.5 rounded-full ${i <= at ? "bg-accent" : "bg-line"}`} />
                  <span className={`mt-1 block text-[length:var(--text-micro)] ${i === at ? "font-semibold" : "text-muted"}`}>{LABEL[s]}</span>
                </li>
              ))}
            </ol>
            <p className="text-muted">{c.kind === "cashless" ? "Cashless" : "Reimbursement"} · opened {fmtShort(c.openedAt)} · claimed {inr(c.amountClaimedInr)}{c.amountSettledInr ? ` · settled ${inr(c.amountSettledInr)}` : ""}</p>
            <p>Next check by <strong>{fmtShort(c.slaDueAt)}</strong>.</p>
            <div>
              <h3 className="font-semibold">Documents the insurer needs</h3>
              {reqs.length === 0 && <p className="text-ok">Nothing missing.</p>}
              <ul className="mt-1 grid gap-1">
                {reqs.map((r) => (
                  <li key={r.id} className="flex min-h-12 flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span aria-hidden className={r.receivedAt ? "text-ok" : "text-warn"}>{r.receivedAt ? "✓" : "○"}</span>
                      <span>{r.label}</span>
                      <span className="chip" data-tone={r.receivedAt ? "ok" : "warn"}>{r.receivedAt ? "Received" : "Still missing"}</span>
                    </span>
                    {staff && <RequirementToggle id={r.id} received={!!r.receivedAt} label={r.label} />}
                  </li>
                ))}
              </ul>
            </div>
            {staff && <ClaimControls claimId={c.id} status={c.status} />}
          </article>
        );
      })}
      {staff && <NewClaimForm familyId={id} />}
      <p className="text-[length:var(--text-small)] text-muted">Insurers are expected to decide cashless approvals within 1 hour and discharge within 3 hours under IRDAI rules. If a claim stalls, the desk escalates and tells you.</p>
    </section>
  );
}
