import Link from "next/link";
import { Logo } from "./Logo";
import { MotionToggle } from "./MotionToggle";

const desk = process.env.NEXT_PUBLIC_DESK_WHATSAPP?.replace(/\D/g, "");

export function SiteHeader({ talkHref = desk ? `https://wa.me/${desk}` : "/#waitlist" }: { talkHref?: string }) {
  return (
    <header className="site-header no-print wrap flex items-center justify-between gap-2 py-3">
      <Link href="/" className="inline-flex min-h-12 items-center" aria-label="Ally home"><Logo /></Link>
      <div className="flex items-center gap-2">
        <MotionToggle />
        <Link className="btn btn-ghost from-tablet" href="/demo">Live demo</Link>
        <Link className="btn btn-ghost from-tablet" href="/signin">Sign in</Link>
        <a className="btn btn-secondary" href={talkHref} aria-label="Talk to a person">
          <span aria-hidden className="sm:hidden">Talk</span>
          <span aria-hidden className="hidden sm:inline">Talk to a person</span>
        </a>
      </div>
    </header>
  );
}
