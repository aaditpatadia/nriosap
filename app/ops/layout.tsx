import Link from "next/link";

export const metadata = { title: "Ops console" };

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <Link href="/ops" className="text-xl font-bold">Gharsaath ops</Link>
        <nav aria-label="Ops" className="flex gap-2">
          <Link className="btn btn-secondary" href="/ops">Queue</Link>
          <Link className="btn btn-secondary" href="/ops/families">Hours per family</Link>
          <Link className="btn btn-ghost" href="/">Site</Link>
        </nav>
      </header>
      <main id="main" className="pb-24">{children}</main>
    </div>
  );
}
