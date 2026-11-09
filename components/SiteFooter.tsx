import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="wrap flex flex-col items-center justify-between gap-2 border-t border-line py-8 text-center text-[length:var(--text-small)] text-muted md:flex-row md:text-left">
      <p>Ally is a working name. We do not give medical, legal or tax advice.</p>
      <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-4">
        <Link className="inline-flex min-h-12 items-center underline" href="/">Home</Link>
        <Link className="inline-flex min-h-12 items-center underline" href="/demo">Live demo</Link>
        <Link className="inline-flex min-h-12 items-center underline" href="/trust">Trust</Link>
        <Link className="inline-flex min-h-12 items-center underline" href="/privacy">Privacy</Link>
        <Link className="inline-flex min-h-12 items-center underline" href="/signin">Sign in</Link>
      </nav>
    </footer>
  );
}
