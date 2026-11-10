import { notFound } from "next/navigation";
import { AccountBar } from "@/components/AccountBar";
import { Shell, type ShellItem } from "@/components/FamilyNav";
import { MotionToggle } from "@/components/MotionToggle";
import { TextSizeToggle } from "@/components/TextSizeToggle";
import { requireViewer } from "@/lib/auth";
import { familyAccess } from "@/lib/service-requests";
import { approvalsFor, getFamily, listFamilies, logAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function FamilyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer(`/family/${id}`);
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [approvals, families, access] = await Promise.all([approvalsFor(id), listFamilies(), familyAccess(id), logAudit(viewer.id, "view_family", "family", id, id)]);
  const pending = approvals.filter((a) => a.status === "pending").length;
  const full = access.owner || access.staff;
  const base = `/family/${id}`;
  const items: (ShellItem & { show: boolean })[] = [
    { href: base, label: "Overview", icon: "home", show: true, primary: true },
    { href: `${base}/requests`, label: "My Requests", icon: "list", show: access.canReadRequests, primary: true, short: "Requests" },
    { href: `${base}/documents`, label: "Document Vault", icon: "folder", show: true, primary: true, short: "Vault" },
    { href: `${base}/properties`, label: "Properties & Assets", icon: "building", show: access.canReadRequests },
    { href: `${base}/people`, label: "Family", icon: "people", show: access.owner },
    { href: `${base}/bills`, label: "Bills & Renewals", icon: "calendar", show: access.canSeeBills },
    { href: `${base}/approvals`, label: "Approvals", icon: "check", show: full, badge: pending, primary: true },
    { href: `${base}/ask`, label: "Ally Assistant", icon: "spark", show: true },
    { href: `${base}/activity`, label: "Reports & Activity", icon: "chart", show: access.canSeeActivity },
    { href: `${base}/settings`, label: "Settings", icon: "settings", show: true },
  ];
  return (
    <Shell
      home={base}
      navLabel="Family sections"
      items={items.filter((i) => i.show).map(({ show: _s, ...i }) => i)}
      cta={access.canCreate ? { href: `${base}/requests/new`, label: "New request" } : undefined}
      foot={<><div className="flex gap-1"><MotionToggle /><TextSizeToggle /></div><AccountBar name={viewer.name} families={families} currentId={id} /></>}
    >
      <main id="main">{children}</main>
    </Shell>
  );
}
