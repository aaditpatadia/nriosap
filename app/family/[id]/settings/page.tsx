import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui";
import { signOut } from "@/app/signin/actions";
import { getViewer } from "@/lib/auth";
import { familyAccess } from "@/lib/service-requests";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { whatsappLinkedAt } from "@/lib/wa-inbox";

export const metadata = { title: "Settings" };

export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [viewer, access] = await Promise.all([getViewer(), familyAccess(id)]);
  if (!viewer) notFound();
  const base = `/family/${id}`;
  const full = access.owner || access.staff;
  const row = (href: string, label: string, help: string) => <li key={href}><Link className="row-link" href={href}><span><span className="block font-medium">{label}</span><span className="block text-[length:var(--text-small)] text-muted">{help}</span></span><span aria-hidden className="text-muted">›</span></Link></li>;
  return (
    <section className="grid max-w-3xl gap-5">
      <PageHeader title="Settings" sub="Your country, cities and how we reach you are under Family & Details." />
      {full && (
        <Panel title="Your account">
          <ul className="rows">
            {row(`${base}/billing`, "Plan and billing", "What your plan includes, and your subscription.")}
            {row(`${base}/privacy`, "Privacy and your data", "Consent, who opened what, export everything, or delete your account.")}
            {row(`${base}/activity`, "Reports and activity", "Every update on your account, and monthly reports to download.")}
            {row(`${base}/claims`, "Insurance claims", "Claims paperwork the desk is following.")}
            {row(`${base}/ask`, "Ally Assistant", "Ask about your own records. Choose whether an AI service may help.")}
          </ul>
        </Panel>
      )}
      {access.owner && viewer.role === "owner" && (
        <Panel title="WhatsApp">
          <WhatsAppLink linkedAt={await whatsappLinkedAt(viewer.id)} deskNumber={process.env.NEXT_PUBLIC_DESK_WHATSAPP?.replace(/\D/g, "") || null} />
        </Panel>
      )}
      <Panel title="Signed in as">
        <p className="font-medium">{viewer.name}{viewer.email ? <span className="block text-[length:var(--text-small)] font-normal text-muted">{viewer.email}</span> : null}</p>
        <form action={signOut}><button className="btn btn-secondary">Sign out</button></form>
      </Panel>
    </section>
  );
}
