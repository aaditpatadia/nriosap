import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentControls, DocumentDetailsForm, DocumentPreview, NewVersionButton, RenameAndLink } from "@/components/DocumentControls";
import { UploadForm } from "@/components/UploadForm";
import { Empty, PageHeader, Panel } from "@/components/ui";
import { WithdrawButton } from "@/components/WithdrawButton";
import { membersFor, sharesFor } from "@/lib/family-members";
import { fmtDate, inr } from "@/lib/format";
import { DOCUMENT_CATEGORIES, isDocumentCategory, isOpenStatus } from "@/lib/request-engine";
import { familyAccess, propertiesFor, requestsFor } from "@/lib/service-requests";
import { documentsFor, getFamily, policyFor } from "@/lib/store";
import { PURPOSE_LABEL, type Purpose } from "@/lib/upload-rules";
import { accessLogFor, relatedRequests } from "@/lib/workspace";
import { daysBetween, istDate } from "@/lib/workspace-rules";

export const metadata = { title: "Document Vault" };

const CATEGORY_HELP: Partial<Record<string, string>> = {
  banking: "Ally organises these records. It is not a bank and does not give financial advice.",
  legal: "A qualified professional or a legally valid authorisation may be needed before any of these can be used.",
  family: "Medical documents need the consent of the person they are about.",
};

export default async function Documents({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; cat?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const access = await familyAccess(id);
  const full = access.owner || access.staff;
  const [all, policy, members, shares, properties, log, related] = await Promise.all([documentsFor(id), full ? policyFor(id) : undefined, access.owner ? membersFor(id) : [], access.owner ? sharesFor(id) : [], access.canReadRequests ? propertiesFor(id) : [], full ? accessLogFor(id) : {}, access.canReadRequests ? relatedRequests(id) : {}]);
  const openRequests = access.canCreate && access.canReadRequests ? (await requestsFor(id)).filter((r) => isOpenStatus(r.status)).map((r) => ({ id: r.id, label: `${r.ref}: ${r.title}`.slice(0, 80) })) : [];
  // Older versions stay stored and listed under the newest one.
  const replaced = new Set(all.map((d) => d.supersedes).filter(Boolean));
  const docs = all.filter((d) => !replaced.has(d.id));
  const history = (d: (typeof all)[number]) => { const out = []; let cur = d; while (cur.supersedes) { const prev = all.find((x) => x.id === cur.supersedes); if (!prev) break; out.push(prev); cur = prev; } return out; };
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 100);
  const cat = isDocumentCategory(sp.cat) ? sp.cat : null;
  // Runs here, after decryption and row security, so it only ever searches what this person may see.
  const shown = docs.filter((d) => (!cat || d.category === cat) && (!q || [d.title, d.kind, DOCUMENT_CATEGORIES[d.category], d.uploadedAt.slice(0, 10), d.expiresOn ?? "", ...d.tags, ...Object.keys(d.extracted), ...Object.values(d.extracted)].join(" ").toLowerCase().includes(q)));
  const counts = docs.reduce<Record<string, number>>((m, d) => ({ ...m, [d.category]: (m[d.category] ?? 0) + 1 }), {});
  const base = `/family/${id}/documents`;
  const today = istDate(new Date());
  const active = members.filter((m) => m.status === "active");
  const blocked = fam.parent.consentStatus === "granted" ? undefined : fam.parent.isSelf ? "We can add documents once your consent is on file." : "We can add documents once your parent's consent call is finished.";
  const propertyList = properties.map((p) => ({ id: p.id, name: p.name }));
  return (
    <section className="grid gap-5">
      <PageHeader title="Document Vault" sub="Private by default. Files open through links that last 60 seconds, and every access is written down.">
        {access.owner && <a className="btn btn-secondary" href={`/api/family/${id}/export`}>Export everything</a>}
      </PageHeader>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="grid gap-4">
          <form className="flex flex-wrap items-end gap-2" role="search" action={base}>
            {cat && <input type="hidden" name="cat" value={cat} />}
            <label className="field min-w-0 flex-1 basis-60">Search your documents<input className="input" name="q" defaultValue={sp.q ?? ""} placeholder="Name, category, date or tag" /></label>
            <button className="btn btn-secondary">Search</button>
          </form>
          <nav aria-label="Document categories" className="tab-row">
            <Link href={base} className="tab" aria-current={!cat ? "true" : undefined}>All ({docs.length})</Link>
            {Object.entries(DOCUMENT_CATEGORIES).map(([k, label]) => <Link key={k} href={`${base}?cat=${k}`} className="tab" aria-current={cat === k ? "true" : undefined}>{label} ({counts[k] ?? 0})</Link>)}
          </nav>
          {cat && CATEGORY_HELP[cat] && <p className="text-[length:var(--text-small)] text-warn">{CATEGORY_HELP[cat]}</p>}
          {policy && <Panel title="Health policy"><p className="text-[length:var(--text-small)]">{policy.insurer}{policy.sumInsuredInr ? ` · sum insured ${inr(policy.sumInsuredInr)}` : ""}</p><p className="text-[length:var(--text-small)] text-muted">Policy number {policy.policyNoMasked} (stored encrypted){policy.renewalDate ? ` · renews ${fmtDate(policy.renewalDate)}` : ""}</p></Panel>}
          {shown.length === 0 && <Empty title={docs.length === 0 ? "Your vault is empty." : "Nothing matches that search."}>{docs.length === 0 ? "Bring together what is spread across email, WhatsApp and old folders. Start with one document." : "Try a different word, or another category."}</Empty>}
          <ul className="grid gap-3">
            {shown.map((d) => {
              const low = d.confidence < 0.9;
              const days = d.expiresOn ? daysBetween(today, d.expiresOn) : null;
              const older = history(d);
              const entries = (log as Record<string, { at: string; action: string; actor: string }[]>)[d.id] ?? [];
              const links = (related as Record<string, { id: string; ref: string }[]>)[d.id] ?? [];
              return (
                <li key={d.id} className="card grid content-start gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold [overflow-wrap:anywhere]">{d.title}{d.version > 1 ? ` (version ${d.version})` : ""}</h2>
                    <span className="flex flex-wrap gap-2">
                      {days !== null && <span className="chip" data-tone={days < 0 || days <= 30 ? "danger" : days <= 60 ? "warn" : undefined}>{days < 0 ? "Expired" : `Expires in ${days} day${days === 1 ? "" : "s"}`}</span>}
                      <span className="chip" data-tone={low && !d.checkedBy && d.extractionStatus !== "skipped" ? "warn" : undefined}>{d.checkedBy ? `Checked by ${d.checkedBy}` : d.extractionStatus === "skipped" ? "Not read" : low ? "Needs a human check" : "Read by AI"}</span>
                    </span>
                  </div>
                  <p className="text-[length:var(--text-small)] text-muted">{DOCUMENT_CATEGORIES[d.category]} · Added {fmtDate(d.uploadedAt)}{d.expiresOn ? ` · ${d.expiryConfirmed ? "Expires" : "Suggested expiry"} ${fmtDate(d.expiresOn)}` : ""}{d.extractionStatus === "skipped" ? "" : ` · confidence ${Math.round(d.confidence * 100)}%`}</p>
                  {d.tags.length > 0 && <p className="flex flex-wrap gap-1">{d.tags.map((t) => <span key={t} className="chip">{t}</span>)}</p>}
                  {days !== null && days <= 60 && access.canCreate && <Link className="btn btn-secondary w-fit" href={`/family/${id}/requests/new?text=${encodeURIComponent(`Please help me renew ${d.title}, which expires on ${d.expiresOn}.`)}`}>Request renewal help</Link>}
                  {Object.keys(d.extracted).length > 0 && (
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[length:var(--text-small)]">
                      {Object.entries(d.extracted).map(([k, v]) => (
                        <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="[overflow-wrap:anywhere]">{v}</dd><dd className="text-muted tabular-nums">{Math.round((d.fieldConfidence?.[k] ?? d.confidence) * 100)}%</dd></div>
                      ))}
                    </dl>
                  )}
                  <p className="text-[length:var(--text-micro)] text-muted">Allowed: {d.consentPurposes.map((p) => PURPOSE_LABEL[p as Purpose] ?? p).join(", ") || "Nothing"}</p>
                  {links.length > 0 && <p className="text-[length:var(--text-small)]">Related: {links.map((r, i) => <span key={r.id}>{i > 0 ? ", " : ""}<Link className="font-semibold text-accent" href={`/family/${id}/requests/${r.id}`}>{r.ref}</Link></span>)}</p>}
                  <div className="flex flex-wrap items-center gap-1">
                    <a className="btn btn-secondary" href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" aria-label={`Open ${d.title}`}>Open</a>
                    <a className="btn btn-ghost" href={`/api/documents/${d.id}/file?download=1`} aria-label={`Download ${d.title}`}>Download</a>
                    {d.mime?.startsWith("image/") && <DocumentPreview documentId={d.id} title={d.title} />}
                    {full && <NewVersionButton familyId={id} documentId={d.id} title={d.title} />}
                    {full && <WithdrawButton documentId={d.id} purpose="store" label="Remove from vault" warn="This deletes the file for good." />}
                  </div>
                  {full && <RenameAndLink documentId={d.id} title={d.title} requests={openRequests} />}
                  {full && <DocumentDetailsForm documentId={d.id} expiresOn={d.expiresOn ?? ""} issuedOn={d.issuedOn ?? ""} tags={d.tags} propertyId={d.propertyId ?? ""} properties={propertyList} suggested={!!d.expiresOn && !d.expiryConfirmed} />}
                  {access.owner && <DocumentControls documentId={d.id} category={d.category} members={active.map((m) => ({ id: m.id, name: m.name }))} sharedWith={shares.filter((s) => s.documentId === d.id).map((s) => s.memberId)} />}
                  {older.length > 0 && <details className="text-[length:var(--text-small)]"><summary className="flex min-h-12 cursor-pointer items-center font-semibold">Earlier versions ({older.length})</summary><ul className="rows">{older.map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>Version {o.version}, added {fmtDate(o.uploadedAt)}</span><a className="btn btn-ghost" href={`/api/documents/${o.id}/file`} target="_blank" rel="noreferrer" aria-label={`Open version ${o.version} of ${o.title}`}>Open</a></li>)}</ul></details>}
                  {entries.length > 0 && <details className="text-[length:var(--text-small)]"><summary className="flex min-h-12 cursor-pointer items-center font-semibold">Access log</summary><ul className="rows">{entries.slice(0, 10).map((e, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-2"><span>{e.action} by {e.actor}</span><span className="text-muted">{fmtDate(e.at)}</span></li>)}</ul></details>}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="grid gap-4">
          {access.canUpload && <UploadForm familyId={id} blocked={blocked} />}
          <Panel title="Ask your documents">
            <form className="grid gap-2" action={`/family/${id}/ask`}>
              <label className="field">What are you looking for?<input className="input" name="q" maxLength={300} placeholder="When does my health insurance expire?" /></label>
              <button className="btn btn-secondary w-fit">Ask Ally</button>
            </form>
          </Panel>
        </div>
      </div>
    </section>
  );
}
