import { AccountBar } from "@/components/AccountBar";
import { Shell, type ShellItem } from "@/components/FamilyNav";
import { MotionToggle } from "@/components/MotionToggle";
import { TextSizeToggle } from "@/components/TextSizeToggle";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "Ops console" };
export const dynamic = "force-dynamic";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  const items: ShellItem[] = [
    { href: "/ops", label: "Overview", icon: "home", primary: true },
    { href: "/ops/requests", label: "Requests", icon: "list", primary: true, also: ["/ops/approvals", "/ops/visits"] },
    { href: "/ops/families", label: "Families", icon: "people", primary: true, also: ["/ops/properties", "/ops/documents"] },
    { href: "/ops/queue", label: "Task Queue", icon: "queue", primary: true, short: "Queue", also: ["/ops/task", "/ops/new"] },
    { href: "/ops/settings", label: "Settings", icon: "settings", also: ["/ops/partners", "/ops/coordinators", "/ops/reports"] },
  ];
  return (
    <Shell
      home="/ops"
      navLabel="Ops"
      items={items}
      foot={<><div className="flex gap-1"><MotionToggle /><TextSizeToggle /></div><AccountBar name={`${viewer.name} (${viewer.role})`} /></>}
    >
      <main id="main">{children}</main>
    </Shell>
  );
}
