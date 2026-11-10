import { notFound } from "next/navigation";
import { AssistantChat } from "@/components/AssistantChat";
import { PageHeader } from "@/components/ui";
import { assistantAiConfigured } from "@/lib/assistant-ai";
import { getViewer } from "@/lib/auth";
import { familyAccess } from "@/lib/service-requests";
import { assistantConsent } from "@/lib/workspace";

export const metadata = { title: "Ally Assistant" };

export default async function Ask({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  const { q } = await searchParams;
  const [viewer, access] = await Promise.all([getViewer(), familyAccess(id)]);
  if (!viewer || (!access.owner && !access.staff && !access.member)) notFound();
  return (
    <section className="grid max-w-4xl gap-5">
      <PageHeader title="Ally Assistant" sub="Ask about your own records. Every answer shows where it came from." />
      <AssistantChat familyId={id} initial={(q ?? "").slice(0, 300)} aiAvailable={assistantAiConfigured()} aiOn={await assistantConsent(viewer.id)} />
    </section>
  );
}
