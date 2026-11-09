import { notFound } from "next/navigation";
import { documentsFor, getFamily, policyFor } from "@/lib/store";
import { fmtDate, inr } from "@/lib/format";

export default async function Documents({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getFamily(id)) notFound();
  const docs = documentsFor(id, "demo-owner");
  const policy = policyFor(id, "demo-owner");
  return (
    <section className="grid gap-4">
      <h1 className="text-[length:var(--text-h1)] font-bold">Documents</h1>
      {policy && (
        <div className="card grid gap-1">
          <h2 className="text-[length:var(--text-h3)] font-semibold">Health policy</h2>
          <p>{policy.insurer} · sum insured {inr(policy.sumInsuredInr)}</p>
          <p className="text-muted">Policy number {policy.policyNoMasked} (stored encrypted) · renews {fmtDate(policy.renewalDate)}</p>
        </div>
      )}
      <ul className="grid gap-3">
        {docs.map((d) => {
          const low = d.confidence < 0.9;
          return (
            <li key={d.id} className="card grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[length:var(--text-h3)] font-semibold">{d.title}</h2>
                <span className="chip" data-tone={low && !d.checkedBy ? "warn" : "ok"}>
                  {d.checkedBy ? `Checked by ${d.checkedBy}` : low ? "Needs a human check" : "Read by AI"}
                </span>
              </div>
              <p className="text-muted">Added {fmtDate(d.uploadedAt)} · confidence {Math.round(d.confidence * 100)}%</p>
              {Object.keys(d.extracted).length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-[length:var(--text-small)]">
                  {Object.entries(d.extracted).map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>))}
                </dl>
              )}
              <p className="text-[length:var(--text-micro)] text-muted">Consent: {d.consentPurposes.join(", ")}</p>
            </li>
          );
        })}
      </ul>
      <p className="text-[length:var(--text-small)] text-muted">Every time someone opens this page it is written to an access log you can request. You can export or delete your family's data at any time.</p>
    </section>
  );
}
