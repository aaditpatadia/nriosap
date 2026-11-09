import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/Timeline";
import { familyAccess } from "@/lib/service-requests";
import { timeline } from "@/lib/store";

export const metadata = { title: "Activity & Reports" };

export default async function Activity({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await familyAccess(id);
  if (!access.canSeeActivity) notFound();
  const events = await timeline(id);
  return (
    <section className="grid gap-5">
      <h1 className="text-[length:var(--text-h1)] font-extrabold">Activity &amp; Reports</h1>
      {(access.owner || access.staff) && (
        <div className="flex flex-wrap gap-2">
          <Link className="btn btn-secondary" href={`/family/${id}/report`}>Monthly report</Link>
          <Link className="btn btn-secondary" href={`/family/${id}/privacy`}>Access log</Link>
        </div>
      )}
      <Timeline events={events} />
    </section>
  );
}
