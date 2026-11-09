import Link from "next/link";
import { signOut } from "@/app/signin/actions";

/** Who is signed in, a way out, and links between families when someone can see more than one. */
export function AccountBar({ name, families, currentId }: { name: string; families?: { id: string; name: string }[]; currentId?: string }) {
  return (
    <aside aria-label="Your account" className="flex flex-wrap items-center justify-between gap-3 py-2 text-[length:var(--text-small)] text-muted">
      <p>Signed in as <strong className="text-ink">{name}</strong></p>
      <div className="flex flex-wrap items-center gap-3">
        {families && families.length > 1 && families.map((f) => (
          <Link key={f.id} href={`/family/${f.id}`} className={`inline-flex min-h-12 items-center ${f.id === currentId ? "font-semibold text-ink" : "underline"}`}>{f.name}</Link>
        ))}
        <form action={signOut}><button className="btn btn-ghost">Sign out</button></form>
      </div>
    </aside>
  );
}
