import { notFound } from "next/navigation";
import { UploadForm } from "@/components/UploadForm";
import { WithdrawButton } from "@/components/WithdrawButton";
import { documentsFor, getFamily, policyFor } from "@/lib/store";
import { fmtDate, inr } from "@/lib/format";
import { PURPOSE_LABEL, type Purpose } from "@/lib/upload-rules";

export default async function Documents({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [docs, policy] = await Promise.all([documentsFor(id), policyFor(id)]);
  return (
    <section className="grid gap-4">
      <h1 className="text-[length:var(--text-h1)] font-bold">Documents</h1>
      {policy && (
        <div className="card grid gap-1">
          <h2 className="text-[length:var(--text-h3)] font-semibold">Health policy</h2>
          <p>{policy.insurer}{policy.sumInsuredInr ? ` · sum insured ${inr(policy.sumInsuredInr)}` : ""}</p>
          <p className="text-muted">Policy number {policy.policyNoMasked} (stored encrypted){policy.renewalDate ? ` · renews ${fmtDate(policy.renewalDate)}` : ""}</p>
        </div>
      )}
      <UploadForm familyId={id} blocked={fam.parent.consentStatus === "granted" ? undefined : "We can add documents once your parent's consent call is finished."} />
      {docs.length === 0 && <p className="text-muted">Nothing here yet.</p>}
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
                <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[length:var(--text-small)]">
                  {Object.entries(d.extracted).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{k}</dt>
                      <dd className="[overflow-wrap:anywhere]">{v}</dd>
                      <dd className="text-muted tabular-nums">{Math.round((d.fieldConfidence?.[k] ?? d.confidence) * 100)}%</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="text-[length:var(--text-micro)] text-muted">Allowed: {d.consentPurposes.map((p) => PURPOSE_LABEL[p as Purpose] ?? p).join(", ") || "Nothing"}</p>
              <div className="flex flex-wrap items-center gap-2">
                {<a className="btn btn-secondary" href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" aria-label={`Open ${d.title}`}>Open</a>}
                <WithdrawButton documentId={d.id} purpose="store" label="Remove from vault" warn="This deletes the file for good." />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[length:var(--text-small)] text-muted">Every time someone opens a document it is written to an access log you can see. You can export or delete your family&apos;s data at any time.</p>
    </section>
  );
}
