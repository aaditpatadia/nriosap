import { notFound } from "next/navigation";
import { RequestComposer } from "@/components/RequestComposer";
import { documentsFor, getFamily } from "@/lib/store";
import { familyAccess } from "@/lib/service-requests";

export const metadata = { title: "Get Anything Done" };

export default async function NewRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ text?: string }> }) {
  const { id } = await params;
  const { text } = await searchParams;
  const [fam, access] = await Promise.all([getFamily(id), familyAccess(id)]);
  if (!fam || !access.canCreate) notFound();
  const docs = access.canSeeVault ? await documentsFor(id) : [];
  return (
    <section className="grid max-w-4xl gap-6">
      <div>
        <h1 className="text-[length:var(--text-h1)] font-extrabold">Get Anything Done</h1>
        <p className="mt-1 text-muted">Say what you need, in your own words. If it is legal and a person can do it in India, ask.</p>
      </div>
      <RequestComposer familyId={id} vault={docs.map((d) => ({ id: d.id, title: d.title }))} canUpload={access.canUpload && fam.parent.consentStatus === "granted"} initial={(text ?? "").slice(0, 500)} />
    </section>
  );
}
