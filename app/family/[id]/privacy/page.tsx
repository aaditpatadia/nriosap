import { notFound } from "next/navigation";
import { DeleteFamilyForm, WithdrawParentButton } from "@/components/PrivacyControls";
import { getViewer, isStaff } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/format";
import { consentsFor } from "@/lib/onboarding";
import { auditLog, getFamily } from "@/lib/store";
import { PURPOSE_LABEL } from "@/lib/upload-rules";

const ACTION: Record<string, string> = { view_family: "Opened the family page", view_document_list: "Opened the document list", view_policy: "Viewed the policy", view_document: "Opened a document", view_document_fields: "Checked a document", document_uploaded: "Added a document", data_exported: "Exported the data", approval_approved: "Approved", approval_declined: "Declined", approval_undone: "Undid a decision", log_time: "Logged time" };

export const metadata = { title: "Privacy" };

export default async function Privacy({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [viewer, consents, audit] = await Promise.all([getViewer(), consentsFor(id), auditLog(id)]);
  const owner = viewer?.id === fam.owner.id;
  return (
    <section className="grid gap-4 lg:grid-cols-2 lg:items-start [&>h1]:lg:col-span-2">
      <h1 className="text-[length:var(--text-h1)] font-bold">Privacy and your data</h1>

      <div className="card grid gap-2">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Consent on record</h2>
        <ul className="grid gap-1 text-[length:var(--text-small)]">
          {consents.map((c) => (
            <li key={c.id}>{c.subject === "parent" ? fam.parent.name : "You"}: {PURPOSE_LABEL[c.purpose]}. <span className="text-muted">{c.withdrawnAt ? `Withdrawn ${fmtDate(c.withdrawnAt)}` : c.grantedAt ? `Given ${fmtDate(c.grantedAt)}` : "Not given"}</span></li>
          ))}
        </ul>
        {fam.parent.consentStatus !== "withdrawn" && (owner || isStaff(viewer)) && <WithdrawParentButton familyId={id} parentName={fam.parent.name} />}
        <p className="text-[length:var(--text-small)] text-muted">Your parent can also withdraw at any time by sending STOP on WhatsApp.</p>
      </div>

      {owner && (
        <div className="card grid gap-3">
          <h2 className="text-[length:var(--text-h3)] font-semibold">Take a copy</h2>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-secondary" href={`/api/family/${id}/export?format=json`} download>Download as JSON</a>
            <a className="btn btn-secondary" href={`/api/family/${id}/export?format=zip`} download>Download with files (ZIP)</a>
          </div>
        </div>
      )}

      <div className="card grid gap-2">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Who opened what</h2>
        <ul className="grid gap-1 text-[length:var(--text-small)]">
          {audit.length === 0 && <li className="text-muted">Nothing yet.</li>}
          {audit.slice(0, 50).map((a) => <li key={a.id}>{ACTION[a.action] ?? a.action.replaceAll("_", " ")} <span className="text-muted">{fmtDate(a.at)} {fmtTime(a.at)}</span></li>)}
        </ul>
      </div>

      {owner && <DeleteFamilyForm familyId={id} familyName={fam.name} />}
    </section>
  );
}
