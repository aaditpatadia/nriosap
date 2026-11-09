import Link from "next/link";
import { TextSizeToggle } from "./TextSizeToggle";

export function SiteHeader({ talkHref = "https://wa.me/910000000000" }: { talkHref?: string }) {
  return (
    <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-4 py-4">
      <Link href="/" className="text-xl font-bold tracking-tight" aria-label="Gharsaath home">Gharsaath</Link>
      <div className="flex items-center gap-2">
        <TextSizeToggle />
        <a className="btn btn-secondary" href={talkHref}>Talk to a person</a>
      </div>
    </header>
  );
}
