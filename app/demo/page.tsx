import Link from "next/link";
import { LiveDemo } from "@/components/LiveDemo";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Live demo", description: "Watch a bill go from a parent's WhatsApp photo to a finished, approved task. A fictional family, no account needed." };

export default function Demo() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="wrap grid gap-6 pb-24 pt-4">
        <div>
          <h1 className="text-[length:var(--text-h1)] font-bold">See one bill, start to finish</h1>
          <p className="mt-2 text-muted">It runs as you watch. You play the coordinator and the family. Type as the parent to see how the desk responds.</p>
          <p className="mt-2 text-[length:var(--text-small)] text-muted">A fictional family. No message is sent, no money moves, and nothing you type leaves this page.</p>
        </div>
        <LiveDemo />
        <div className="flex flex-wrap gap-3">
          <Link href="/#waitlist" className="btn btn-primary">Join the waitlist</Link>
          <Link href="/trust" className="btn btn-secondary">How we look after your data</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
