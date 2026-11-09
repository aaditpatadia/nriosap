import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { ParentChat } from "@/components/ParentChat";
import { isDemoMode, requireViewer } from "@/lib/auth";
import { getFamily, messagesFor } from "@/lib/store";

export const metadata = { title: "Parent WhatsApp view (demo)" };

export default async function Chat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireViewer(`/chat/${id}`);
  if (!isDemoMode()) notFound();
  const fam = await getFamily(id);
  if (!fam) notFound();
  const initial = (await messagesFor(id)).map((m) => ({ id: m.id, direction: m.direction, body: m.body, at: m.at }));
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto grid w-full max-w-xl gap-4 px-4 pb-24">
        <h1 className="text-[length:var(--text-h1)] font-bold">WhatsApp view of {fam.parent.name}</h1>
        <p className="text-muted">Simulated for demos. Real messages arrive through the WhatsApp webhook. Try writing &quot;emergency&quot; or &quot;ambulance&quot; to see the escalation.</p>
        <ParentChat familyId={id} initial={initial} parentName={fam.parent.name} />
      </main>
    </>
  );
}
