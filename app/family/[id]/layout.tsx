import { notFound } from "next/navigation";
import { AccountBar } from "@/components/AccountBar";
import { Shell, type ShellItem } from "@/components/FamilyNav";
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
  // Five places only. Bills, properties, approvals, reports and the assistant open from inside them.
  const items: (ShellItem & { show: boolean })[] = [
    { href: base, label: "Home", icon: "home", show: true, primary: true },
    { href: `${base}/requests`, label: "Requests", icon: "list", show: access.canReadRequests, primary: true, badge: full ? pending : 0, also: [`${base}/approvals`] },
    { href: `${base}/documents`, label: "Documents", icon: "folder", show: true, primary: true },
    { href: `${base}/details`, label: "Family & Details", icon: "people", show: full, primary: true, short: "Family", also: [`${base}/people`, `${base}/properties`, `${base}/bills`] },
    { href: `${base}/settings`, label: "Settings", icon: "settings", show: true, also: [`${base}/billing`, `${base}/privacy`] },
  ];
  return (
    <Shell
      home={base}
      navLabel="Family sections"
      items={items.filter((i) => i.show).map(({ show: _s, ...i }) => i)}
      cta={access.canCreate ? { href: `${base}/requests/new`, label: "New request" } : undefined}
      foot={<AccountBar name={viewer.name} families={families} currentId={id} />}
    >
      <main id="main">{children}</main>
    </Shell>
  );
}
