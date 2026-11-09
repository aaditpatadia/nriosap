import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Trust", description: "How Gharsaath looks after your family's documents, what we do and what we will not do." };

const ITEMS: [string, string][] = [
  ["Who can see your documents", "You and the coordinator assigned to your family. The founder can see them when checking the work. Nobody else."],
  ["Every look is written down", "Each time someone opens a document or a policy, it goes in an access log you can read on your Privacy page."],
  ["Policy numbers are locked", "Policy numbers and details read from documents are encrypted before they are stored, with a separate key for each family. Files sit in private storage and open through links that expire in 60 seconds."],
  ["Consent comes first, and piece by piece", "We ask for each purpose separately, and for each document. A coordinator calls your parent in their own language before anything starts."],
  ["An AI service reads the documents", "We send files to an AI provider to pull out key facts such as dates and amounts. It gives a confidence score for each one. Anything under 90% is checked by a person. AI never pays, files or sends anything by itself."],
  ["You can leave with everything", "Download your family's data yourself, as a file or a ZIP. Delete it yourself. Your parent can stop by sending STOP on WhatsApp, and we stop at once."],
];

export default function Trust() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="wrap grid gap-6 pb-24 pt-6">
        <h1 className="text-[length:var(--text-h1)] font-bold">How we look after your family</h1>
        <p className="text-muted">Short and plain. If something here is not good enough for your family, please tell us.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ITEMS.map(([t, d]) => (
            <section key={t} className="card">
              <h2 className="text-[length:var(--text-h3)] font-semibold">{t}</h2>
              <p className="mt-1 text-muted">{d}</p>
            </section>
          ))}
        </div>
        <section className="card grid gap-2">
          <h2 className="text-[length:var(--text-h3)] font-semibold">What is not finished yet</h2>
          <ul className="grid list-disc gap-1 pl-6 text-muted">
            <li>A lawyer is still to review our claims help, our payment steps and our consent wording.</li>
            <li>WhatsApp business verification is not done, so automatic sending is off.</li>
            <li>We are confirming where data is stored and will say so here.</li>
            <li>Payments to third parties are completed by a person. We have no licensed payment partner yet.</li>
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
