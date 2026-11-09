import { notFound } from "next/navigation";
import { AddMemberForm, MemberCard } from "@/components/FamilyForms";
import { membersFor } from "@/lib/family-members";
import { familyAccess } from "@/lib/service-requests";

export const metadata = { title: "Family" };

export default async function People({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await familyAccess(id)).owner) notFound();
  const members = await membersFor(id);
  return (
    <section className="grid gap-6">
      <div>
        <h1 className="text-[length:var(--text-h1)] font-extrabold">Family</h1>
        <p className="mt-1 text-muted">Add the people who are part of this. You choose what each one can see and do. Only you can approve payments, manage people or delete data.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid gap-3">
          {members.length === 0 && <p className="card text-muted">Nobody added yet. Parents do not need to use this app. Add them as a WhatsApp contact and your coordinator will call them first.</p>}
          {members.map((m) => <MemberCard key={m.id} member={m} />)}
        </div>
        <AddMemberForm familyId={id} />
      </div>
    </section>
  );
}
