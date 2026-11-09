import Link from "next/link";
import { TextSizeToggle } from "./TextSizeToggle";

const desk = process.env.NEXT_PUBLIC_DESK_WHATSAPP?.replace(/\D/g, "");

export function SiteHeader({ talkHref = desk ? `https://wa.me/${desk}` : "/#waitlist" }: { talkHref?: string }) {
  return (
    <header className="no-print wrap flex items-center justify-between gap-3 py-4">
      <Link href="/" className="inline-flex min-h-12 items-center text-xl font-bold tracking-tight" aria-label="Gharsaath home">Gharsaath</Link>
      <div className="flex items-center gap-2">
        <TextSizeToggle />
        <Link className="btn btn-secondary hidden md:inline-flex" href="/demo">Live demo</Link>
        <a className="btn btn-secondary" href={talkHref}>Talk to a person</a>
      </div>
    </header>
  );
}
