import Link from "next/link";
import { AccountBar } from "@/components/AccountBar";
import { Logo } from "@/components/Logo";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "Ops console" };
export const dynamic = "force-dynamic";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  return (
    <div className="wrap">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <Link href="/ops" className="inline-flex min-h-12 items-center gap-2"><Logo /><span className="chip">Ops</span></Link>
        <nav aria-label="Ops" className="flex flex-wrap gap-2">
          <Link className="btn btn-secondary" href="/ops/requests">Requests</Link>
          <Link className="btn btn-secondary" href="/ops">Queue</Link>
          <Link className="btn btn-secondary" href="/ops/families">Hours per family</Link>
        </nav>
      </header>
      <AccountBar name={`${viewer.name} (${viewer.role})`} />
      <main id="main" className="pb-24 pt-2">{children}</main>
    </div>
  );
}
