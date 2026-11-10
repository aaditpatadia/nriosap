import Link from "next/link";
import { signOut } from "@/app/signin/actions";

/** Who is signed in, a way out, and links between accounts when someone can see more than one. */
export function AccountBar({ name, families, currentId }: { name: string; families?: { id: string; name: string }[]; currentId?: string }) {
  return (
    <div aria-label="Your account" className="grid gap-1 text-muted">
      {families && families.length > 1 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center font-medium">Switch account</summary>
          <ul>{families.map((f) => <li key={f.id}><Link href={`/family/${f.id}`} aria-current={f.id === currentId ? "true" : undefined} className={`flex min-h-11 items-center ${f.id === currentId ? "font-semibold text-ink" : ""}`}>{f.name}</Link></li>)}</ul>
        </details>
      )}
      <p className="[overflow-wrap:anywhere]">Signed in as <strong className="font-semibold text-ink">{name}</strong></p>
      <form action={signOut}><button className="btn btn-ghost px-0">Sign out</button></form>
    </div>
  );
}
