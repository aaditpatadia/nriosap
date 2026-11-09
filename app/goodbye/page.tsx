import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Deleted" };

export default function Goodbye() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto grid w-full max-w-xl gap-4 px-4 pb-24 pt-6">
        <h1 className="text-[length:var(--text-h1)] font-bold">Your family&apos;s data has been deleted</h1>
        <p className="text-muted">Every document, message and record is gone, and your subscription is cancelled. We hope your family is well.</p>
        <Link className="btn btn-secondary w-fit" href="/">Back to the home page</Link>
      </main>
    </>
  );
}
