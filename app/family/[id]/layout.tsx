import { notFound } from "next/navigation";
import { AccountBar } from "@/components/AccountBar";
import { AppShell } from "@/components/FamilyNav";
import { SiteHeader } from "@/components/SiteHeader";
import { requireViewer } from "@/lib/auth";
import { familyAccess } from "@/lib/service-requests";
import { approvalsFor, getCoordinator, getFamily, listFamilies, logAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function FamilyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer(`/family/${id}`);
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [coord, approvals, families, access] = await Promise.all([getCoordinator(fam.coordinatorId), approvalsFor(id), listFamilies(), familyAccess(id), logAudit(viewer.id, "view_family", "family", id, id)]);
  const pending = approvals.filter((a) => a.status === "pending").length;
  const full = access.owner || access.staff;
  const hidden = [
    ...(full ? [] : ["/approvals", "/calendar", "/ask"]),
    ...(full || access.canReadRequests ? [] : ["/requests", "/properties"]),
    ...(full || access.canSeeActivity ? [] : ["/activity"]),
    ...(access.owner ? [] : ["/people"]),
  ];

  return (
    <>
      <SiteHeader />
      <div className="wrap">
        <AccountBar name={viewer.name} families={families} currentId={id} />
        <AppShell base={`/family/${id}`} pendingCount={pending} hidden={hidden} canCreate={access.canCreate}>
          <main id="main" className="py-4 pb-24">
            <div className="no-print mb-6 flex flex-wrap items-center gap-3 text-muted">
              <span>Your coordinator:</span>
              {coord ? (
                <>
                  <strong className="text-ink">{coord.name}</strong>
                  {coord.city && <span>in {coord.city}</span>}
                  {coord.phone && <a className="btn btn-secondary" href={`https://wa.me/${coord.phone.replace(/\D/g, "")}`}>Talk to {coord.name.split(" ")[0]}</a>}
                </>
              ) : (
                <strong className="text-ink">We are assigning a person to you.</strong>
              )}
            </div>
            {children}
          </main>
        </AppShell>
      </div>
    </>
  );
}
