import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { FamilyNav } from "@/components/FamilyNav";
import { approvalsFor, getCoordinator, getFamily, listFamilies } from "@/lib/store";

export default async function FamilyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = getFamily(id);
  if (!fam) notFound();
  const coord = getCoordinator(fam.coordinatorId);
  const pending = approvalsFor(id).filter((a) => a.status === "pending").length;

  return (
    <>
      <SiteHeader />
      <div className="mx-auto w-full max-w-[1120px] px-4">
        <aside aria-label="Demo notice" className="flex flex-wrap items-center justify-between gap-3 py-2 text-[length:var(--text-small)] text-muted">
          <p>Demo view as <strong className="text-ink">{fam.owner.name}</strong> ({fam.owner.city}). Sign-in is mocked in this demo.</p>
          <p className="flex flex-wrap gap-3">
            {listFamilies().map((f) => (
              <Link key={f.id} href={`/family/${f.id}`} className={f.id === id ? "font-semibold text-ink" : "underline"}>{f.name}</Link>
            ))}
          </p>
        </aside>
        <FamilyNav base={`/family/${id}`} pendingCount={pending} />
        <main id="main" className="py-6 pb-24">
          <div className="mb-6 flex flex-wrap items-center gap-3 text-muted">
            <span>Your desk contact:</span>
            <strong className="text-ink">{coord?.name}</strong>
            <span>in {coord?.city}</span>
            <a className="btn btn-secondary" href="https://wa.me/910000000000">Talk to {coord?.name.split(" ")[0]}</a>
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
