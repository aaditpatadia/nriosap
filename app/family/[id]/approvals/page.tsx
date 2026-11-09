import { notFound } from "next/navigation";
import { ApprovalCard } from "@/components/ApprovalCard";
import { getViewer } from "@/lib/auth";
import { approvalsFor, documentsFor, getFamily } from "@/lib/store";

export default async function Approvals({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [docs, list, viewer] = await Promise.all([documentsFor(id), approvalsFor(id), getViewer()]);
  return (
    <section className="grid gap-4">
      <h1 className="text-[length:var(--text-h1)] font-bold">Approvals</h1>
      <p className="text-muted">Nothing is paid, sent or filed until you say yes. After you decide, you have 5 minutes to undo.</p>
      {list.length === 0 && <p className="text-muted">Nothing is waiting for you.</p>}
      {list.map((a) => (
        <ApprovalCard
          key={a.id}
          canDecide={viewer?.id === fam.owner.id}
          approval={{
            id: a.id, summary: a.summary, amountInr: a.amountInr, payee: a.payee, feesInr: a.feesInr, when: a.when, status: a.status, undoUntil: a.undoUntil,
            evidence: a.evidenceIds.map((e) => docs.find((d) => d.id === e)?.title ?? e),
          }}
        />
      ))}
      <p className="text-[length:var(--text-small)] text-muted">In this MVP, payment is a stub. Real payments will go through a licensed partner after legal review.</p>
    </section>
  );
}
