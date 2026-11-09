import { notFound } from "next/navigation";
import { claimsFor, getFamily } from "@/lib/store";
import { fmtShort, inr } from "@/lib/format";

const LABEL = { preparing: "Preparing", submitted: "Submitted", query: "Insurer has a question", approved: "Approved", settled: "Settled" } as const;
const TONE = { preparing: "accent", submitted: "accent", query: "warn", approved: "ok", settled: "ok" } as const;

export default async function Claims({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getFamily(id))) notFound();
  const claims = (await claimsFor(id));
  return (
    <section className="grid gap-4">
      <h1 className="text-[length:var(--text-h1)] font-bold">Claims</h1>
      {claims.length === 0 && <p className="text-muted">No claims yet. If a hospital stay happens, the desk will open one here.</p>}
      {claims.map((c) => (
        <article key={c.id} className="card grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[length:var(--text-h3)] font-semibold">{c.hospital}</h2>
            <span className="chip" data-tone={TONE[c.status]}>{LABEL[c.status]}</span>
          </div>
          <p className="text-muted">{c.kind === "cashless" ? "Cashless" : "Reimbursement"} · opened {fmtShort(c.openedAt)} · claimed {inr(c.amountClaimedInr)}{c.amountSettledInr ? ` · settled ${inr(c.amountSettledInr)}` : ""}</p>
          <p>Next check by <strong>{fmtShort(c.slaDueAt)}</strong>.</p>
          {c.missing.length > 0 ? (
            <div><p className="font-semibold">Still missing</p><ul className="list-disc pl-6 text-muted">{c.missing.map((x) => <li key={x}>{x}</li>)}</ul></div>
          ) : (
            <p className="text-ok">Nothing missing.</p>
          )}
        </article>
      ))}
      <p className="text-[length:var(--text-small)] text-muted">Insurers are expected to decide cashless approvals within 1 hour and discharge within 3 hours under IRDAI rules. If a claim stalls, the desk escalates and tells you.</p>
    </section>
  );
}
