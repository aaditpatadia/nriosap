import { notFound } from "next/navigation";
import { RequestComposer } from "@/components/RequestComposer";
import { PageHeader } from "@/components/ui";
import { documentsFor, getFamily } from "@/lib/store";
import { familyAccess, propertiesFor } from "@/lib/service-requests";
import { membersFor } from "@/lib/family-members";
import { activeRateCard } from "@/lib/pricing";

export const metadata = { title: "New request" };

export default async function NewRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ text?: string; property?: string }> }) {
  const { id } = await params;
  const { text, property } = await searchParams;
  const [fam, access] = await Promise.all([getFamily(id), familyAccess(id)]);
  if (!fam || !access.canCreate) notFound();
  const rc = await activeRateCard();
  const [docs, properties, members] = await Promise.all([access.canSeeVault ? documentsFor(id) : [], access.canReadRequests ? propertiesFor(id) : [], access.owner ? membersFor(id) : []]);
  return (
    <section className="grid max-w-3xl gap-5">
      <PageHeader title="Tell Ally what you need" sub="Say it in your own words. You check everything before it is sent, and nothing costs anything until you approve a quotation." />
      <RequestComposer familyId={id} vault={docs.map((d) => ({ id: d.id, title: d.title }))} properties={properties.map((p) => ({ id: p.id, name: p.name }))} defaultProperty={property ?? ""} contacts={members.map((m) => ({ id: m.id, name: m.name }))} canUpload={access.canUpload && fam.parent.consentStatus === "granted"} initial={(text ?? "").slice(0, 500)} area={{ from: rc.card.areaPinFrom, to: rc.card.areaPinTo }} />
    </section>
  );
}
