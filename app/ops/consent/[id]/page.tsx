import Link from "next/link";
import { notFound } from "next/navigation";
import { ConsentCallForm } from "@/components/StaffForms";
import { requireStaff } from "@/lib/auth";
import { CALL_SCRIPT } from "@/lib/consent";
import { fmtDate } from "@/lib/format";
import { consentsFor } from "@/lib/onboarding";
import { getFamily } from "@/lib/store";
import { PURPOSE_LABEL, PURPOSES } from "@/lib/upload-rules";

export const metadata = { title: "Consent call" };

export default async function ConsentCall({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const records = await consentsFor(id);
  const parentRecords = records.filter((r) => r.subject === "parent");
  return (
    <section className="grid max-w-2xl gap-4">
      <Link href="/ops" className="btn btn-ghost w-fit">Back to queue</Link>
      <h1 className="text-[length:var(--text-h1)] font-bold">Consent call: {fam.parent.name}</h1>
      <p className="text-muted">Call {fam.parent.phone} in {fam.parent.language}. Read each line aloud. Tick only what they agree to in their own words. If they cannot decide for themselves, stop and pause.</p>
      <ConsentCallForm
        familyId={id}
        parentId={fam.parent.id}
        items={PURPOSES.map((p) => ({ purpose: p, label: PURPOSE_LABEL[p], script: CALL_SCRIPT[fam.parent.language][p], already: !!parentRecords.find((r) => r.purpose === p && r.grantedAt && !r.withdrawnAt) }))}
      />
      <div className="card grid gap-2">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Audit trail</h2>
        <ul className="grid gap-1 text-[length:var(--text-small)]">
          {records.map((r) => (
            <li key={r.id}>{r.subject === "parent" ? "Parent" : "Owner"}: {PURPOSE_LABEL[r.purpose]}. {r.withdrawnAt ? `Withdrawn ${fmtDate(r.withdrawnAt)}.` : r.grantedAt ? `Given ${fmtDate(r.grantedAt)}${r.method ? ` by ${r.method.replace("_", " ")}` : ""}${r.confirmer ? `, recorded by ${r.confirmer}` : ""}.` : "Not given yet."}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
