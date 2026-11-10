import { AccountBar } from "@/components/AccountBar";
import { Shell, type ShellItem } from "@/components/FamilyNav";
import { MotionToggle } from "@/components/MotionToggle";
import { TextSizeToggle } from "@/components/TextSizeToggle";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "Ops console" };
export const dynamic = "force-dynamic";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  const admin = viewer.role === "admin";
  const items: (ShellItem & { show?: boolean })[] = [
    { href: "/ops", label: "Overview", icon: "home", primary: true },
    { href: "/ops/families", label: "Families", icon: "people" },
    { href: "/ops/requests", label: "Requests", icon: "list", primary: true },
    { href: "/ops/queue", label: "Task Queue", icon: "queue", primary: true, short: "Queue" },
    { href: "/ops/coordinators", label: "Coordinators", icon: "person", show: admin },
    { href: "/ops/partners", label: "Service Partners", icon: "tool" },
    { href: "/ops/properties", label: "Properties", icon: "building" },
    { href: "/ops/documents", label: "Document Review", icon: "doc" },
    { href: "/ops/approvals", label: "Approvals", icon: "check" },
    { href: "/ops/visits", label: "Visits & Scheduling", icon: "calendar", primary: true, short: "Visits" },
    { href: "/ops/reports", label: "Reports", icon: "chart" },
    { href: "/ops/settings", label: "Settings", icon: "settings", show: admin },
  ];
  return (
    <Shell
      home="/ops"
      navLabel="Ops"
      items={items.filter((i) => i.show !== false).map(({ show: _s, ...i }) => i)}
      foot={<><div className="flex gap-1"><MotionToggle /><TextSizeToggle /></div><AccountBar name={`${viewer.name} (${viewer.role})`} /></>}
    >
      <main id="main">{children}</main>
    </Shell>
  );
}
