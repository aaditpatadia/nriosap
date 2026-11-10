import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { PageHero } from "@/components/PageHero";
import { VaultGraphic } from "@/components/VaultGraphic";

export const metadata = { title: "Trust", description: "How Ally looks after your family's documents, what we do and what we will not do." };

const ITEMS: [string, string][] = [
  ["Who can see your documents", "You and the coordinator assigned to your family. The founder can see them when checking the work. Nobody else."],
  ["Every look is written down", "Each time someone opens a document or a policy, it goes in an access log you can read on your Privacy page."],
  ["Policy numbers are locked", "Policy numbers and details read from documents are encrypted before they are stored, with a separate key for each family. Files sit in private storage and open through links that expire in 60 seconds."],
  ["Consent comes first, and piece by piece", "We ask for each purpose separately, and for each document. If someone else is involved, a coordinator calls them in their own language before anything starts."],
  ["An AI service reads the documents", "We send files, and WhatsApp texts when you agree, to an AI provider outside India to pull out key facts such as dates and amounts. Voice notes are never sent to it. It gives a confidence score for each one. Anything under 90% is checked by a person. AI never pays, files or sends anything by itself."],
  ["You can leave with everything", "Download your family's data yourself, as a file or a ZIP. Delete it yourself. Anyone involved can stop by sending STOP on WhatsApp, and we stop at once."],
];

export default function Trust() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <PageHero title="How we look after your data" lead={<p>Short and plain. If something here is not good enough for your family, please tell us. The full detail is in our <Link className="underline" href="/privacy">privacy policy</Link>.</p>} />
        <div className="wrap grid gap-6 pb-24 pt-8">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ITEMS.map(([t, d], i) => (
            <section key={t} className="card rise" style={{ animationDelay: `${i * 40}ms` }}>
              <h2 className="text-[length:var(--text-h3)] font-semibold">{t}</h2>
              <p className="mt-1 text-muted">{d}</p>
            </section>
          ))}
        </div>
        <div className="band wrap grid items-center gap-6 rounded-[var(--radius-card)] py-10 md:grid-cols-[320px_1fr]">
          <VaultGraphic />
          <p className="text-[length:var(--text-h2)] font-bold">Every sensitive field is locked with its own family key. Nobody opens a document without it being written down.</p>
        </div>
        <section className="card grid gap-2">
          <h2 className="text-[length:var(--text-h3)] font-semibold">What is not finished yet</h2>
          <ul className="grid list-disc gap-1 pl-6 text-muted">
            <li>A lawyer is still to review our claims help, our payment steps and our consent wording.</li>
            <li>WhatsApp is not connected to Ally yet. When it is, a person checks every message, and Ally sends no WhatsApp replies on its own until Meta business verification and message approval are done. Until then a coordinator sends each reply by hand.</li>
            <li>We are confirming where data is stored and will say so here.</li>
            <li>Payments to third parties are completed by a person. We have no licensed payment partner yet.</li>
          </ul>
        </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
