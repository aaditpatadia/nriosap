import Link from "next/link";
import { notFound } from "next/navigation";
import { PreferencesForm } from "@/components/PreferencesForm";
import { getViewer } from "@/lib/auth";
import { preferencesFor } from "@/lib/family-members";
import { familyAccess } from "@/lib/service-requests";

export const metadata = { title: "Settings" };

export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [viewer, access] = await Promise.all([getViewer(), familyAccess(id)]);
  if (!viewer) notFound();
  const prefs = await preferencesFor(viewer.id);
  return (
    <section className="grid max-w-3xl gap-5">
      <h1 className="text-[length:var(--text-h1)] font-extrabold">Settings</h1>
      <PreferencesForm prefs={prefs} />
      {(access.owner || access.staff) && (
        <div className="card grid gap-2">
          <h2 className="text-[length:var(--text-h3)] font-semibold">Your account</h2>
          <Link className="flex min-h-12 items-center font-medium text-accent" href={`/family/${id}/billing`}>Plan and billing</Link>
          <Link className="flex min-h-12 items-center font-medium text-accent" href={`/family/${id}/privacy`}>Privacy, consent, data export and deletion</Link>
          <Link className="flex min-h-12 items-center font-medium text-accent" href={`/family/${id}/claims`}>Insurance claims</Link>
        </div>
      )}
    </section>
  );
}
