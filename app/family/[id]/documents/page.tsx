import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentControls } from "@/components/DocumentControls";
import { UploadForm } from "@/components/UploadForm";
import { WithdrawButton } from "@/components/WithdrawButton";
import { membersFor, sharesFor } from "@/lib/family-members";
import { fmtDate, inr } from "@/lib/format";
import { DOCUMENT_CATEGORIES, isDocumentCategory } from "@/lib/request-engine";
import { familyAccess } from "@/lib/service-requests";
import { documentsFor, getFamily, policyFor } from "@/lib/store";
import { PURPOSE_LABEL, type Purpose } from "@/lib/upload-rules";

export const metadata = { title: "Document Vault" };

const isoDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export default async function Documents({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; cat?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [docs, policy, access, members, shares] = await Promise.all([documentsFor(id), policyFor(id), familyAccess(id), membersFor(id), sharesFor(id)]);
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 100);
  const cat = isDocumentCategory(sp.cat) ? sp.cat : null;
  // Runs here, after decryption and row security, so it only ever searches what this person may see.
  const shown = docs.filter((d) => (!cat || d.category === cat) && (!q || [d.title, d.kind, DOCUMENT_CATEGORIES[d.category], ...Object.keys(d.extracted), ...Object.values(d.extracted)].join(" ").toLowerCase().includes(q)));
  const counts = docs.reduce<Record<string, number>>((m, d) => ({ ...m, [d.category]: (m[d.category] ?? 0) + 1 }), {});
  const base = `/family/${id}/documents`;
  const active = members.filter((m) => m.status === "active");
  const blocked = fam.parent.consentStatus === "granted" ? undefined : fam.parent.isSelf ? "We can add documents once your consent is on file." : "We can add documents once your parent's consent call is finished.";
  const chipClass = (on: boolean) => `chip min-h-12 px-4 ${on ? "border-accent" : ""}`;
  return (
    <section className="grid gap-5">
      <h1 className="text-[length:var(--text-h1)] font-extrabold">Document Vault</h1>
      {policy && (
        <div className="card grid gap-1">
          <h2 className="text-[length:var(--text-h3)] font-semibold">Health policy</h2>
          <p>{policy.insurer}{policy.sumInsuredInr ? ` · sum insured ${inr(policy.sumInsuredInr)}` : ""}</p>
          <p className="text-muted">Policy number {policy.policyNoMasked} (stored encrypted){policy.renewalDate ? ` · renews ${fmtDate(policy.renewalDate)}` : ""}</p>
        </div>
      )}
      {access.canUpload && <UploadForm familyId={id} blocked={blocked} />}

      <form className="flex flex-wrap gap-2" role="search" action={base}>
        {cat && <input type="hidden" name="cat" value={cat} />}
        <label className="field min-w-0 flex-1 basis-60">Search your documents<input className="input" name="q" defaultValue={sp.q ?? ""} placeholder="Name, insurer, date, policy" /></label>
        <button className="btn btn-secondary self-end">Search</button>
      </form>
      <nav aria-label="Document categories" className="flex flex-wrap gap-2">
        <Link href={base} className={chipClass(!cat)} aria-current={!cat ? "true" : undefined}>All ({docs.length})</Link>
        {Object.entries(DOCUMENT_CATEGORIES).map(([k, label]) => <Link key={k} href={`${base}?cat=${k}`} className={chipClass(cat === k)} aria-current={cat === k ? "true" : undefined}>{label} ({counts[k] ?? 0})</Link>)}
      </nav>

      {shown.length === 0 && <p className="card text-muted">{docs.length === 0 ? "Nothing here yet. Add your first document above." : "Nothing matches that search."}</p>}
      <ul className="grid gap-3 xl:grid-cols-2">
        {shown.map((d) => {
          const low = d.confidence < 0.9;
          const expiry = isoDate(d.extracted["Renewal date"] ?? d.extracted["Expiry date"]);
          return (
            <li key={d.id} className="card grid content-start gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[length:var(--text-h3)] font-semibold [overflow-wrap:anywhere]">{d.title}</h2>
                <span className="chip" data-tone={low && !d.checkedBy ? "warn" : "ok"}>
                  {d.checkedBy ? `Checked by ${d.checkedBy}` : d.extractionStatus === "skipped" ? "Not read" : low ? "Needs a human check" : "Read by AI"}
                </span>
              </div>
              <p className="text-muted">{DOCUMENT_CATEGORIES[d.category]} · Added {fmtDate(d.uploadedAt)}{d.extractionStatus === "skipped" ? "" : ` · confidence ${Math.round(d.confidence * 100)}%`}</p>
              {expiry && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-tint p-3">
                  <span className="font-semibold">This expires on {fmtDate(expiry)}.</span>
                  {access.canCreate && <Link className="btn btn-secondary" href={`/family/${id}/requests/new?text=${encodeURIComponent(`Please help me renew ${d.title}, which expires on ${expiry}.`)}`}>Request renewal help</Link>}
                </div>
              )}
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
                <a className="btn btn-secondary" href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" aria-label={`Open ${d.title}`}>Open</a>
                {(access.owner || access.staff) && <WithdrawButton documentId={d.id} purpose="store" label="Remove from vault" warn="This deletes the file for good." />}
              </div>
              {access.owner && <DocumentControls documentId={d.id} category={d.category} members={active.map((m) => ({ id: m.id, name: m.name }))} sharedWith={shares.filter((s) => s.documentId === d.id).map((s) => s.memberId)} />}
            </li>
          );
        })}
      </ul>
      <p className="text-[length:var(--text-small)] text-muted">Every time someone opens a document it is written to an access log you can see. Files open through links that last 60 seconds. You can export or delete your data at any time.</p>
    </section>
  );
}
