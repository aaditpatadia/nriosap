import { notFound } from "next/navigation";
import { AccountBar } from "@/components/AccountBar";
import { SiteHeader } from "@/components/SiteHeader";
import { FamilyNav } from "@/components/FamilyNav";
import { requireViewer } from "@/lib/auth";
import { approvalsFor, getCoordinator, getFamily, listFamilies, logAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function FamilyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer(`/family/${id}`);
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [coord, approvals, families] = await Promise.all([getCoordinator(fam.coordinatorId), approvalsFor(id), listFamilies(), logAudit(viewer.id, "view_family", "family", id, id)]);
  const pending = approvals.filter((a) => a.status === "pending").length;

  return (
    <>
      <SiteHeader />
      <div className="mx-auto w-full max-w-[1120px] px-4">
        <AccountBar name={viewer.name} families={families} currentId={id} />
        <FamilyNav base={`/family/${id}`} pendingCount={pending} />
        <main id="main" className="py-6 pb-24">
          <div className="no-print mb-6 flex flex-wrap items-center gap-3 text-muted">
            <span>Your desk contact:</span>
            {coord ? (
              <>
                <strong className="text-ink">{coord.name}</strong>
                <span>in {coord.city}</span>
                {coord.phone && <a className="btn btn-secondary" href={`https://wa.me/${coord.phone.replace(/\D/g, "")}`}>Talk to {coord.name.split(" ")[0]}</a>}
              </>
            ) : (
              <strong className="text-ink">We are assigning a person to your family.</strong>
            )}
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
