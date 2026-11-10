import Link from "next/link";
import { Logo } from "./Logo";
import { deskChat } from "@/lib/contact";

export function SiteFooter() {
  return (
    <footer className="wrap grid gap-4 border-t border-line py-10 text-[length:var(--text-small)] text-muted md:grid-cols-[1fr_auto] md:items-center">
      <div className="grid gap-2">
        <Logo />
        <p>Ally is a working name. We do not give medical, legal or tax advice.</p>
      </div>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-5">
        <Link className="inline-flex min-h-12 items-center hover:text-ink" href="/demo">Live demo</Link>
        <Link className="inline-flex min-h-12 items-center hover:text-ink" href="/trust">Trust</Link>
        <Link className="inline-flex min-h-12 items-center hover:text-ink" href="/privacy">Privacy</Link>
        <Link className="inline-flex min-h-12 items-center hover:text-ink" href="/signin">Sign in</Link>
        <a className="inline-flex min-h-12 items-center font-semibold text-accent" href={deskChat("Hi Ally, I would like to talk to a person.")} target="_blank" rel="noopener noreferrer">WhatsApp us</a>
      </nav>
    </footer>
  );
}
