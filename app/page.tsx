import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WaitlistForm } from "@/components/WaitlistForm";
import { Reveal } from "@/components/Reveal";

const PLANS = [
  { name: "Lite", price: 40, blurb: "Records vault, renewals, monthly report, up to 3 tasks a month.", note: "For parents who are independent." },
  { name: "Family", price: 79, blurb: "Everything in Lite plus claims help, bills and errands, WhatsApp check-ins every week.", note: "Most families choose this.", featured: true },
  { name: "Plus", price: 119, blurb: "Everything in Family plus priority response, in-person visits and hospital desk support.", note: "For parents who need more hands-on help." },
];

const COMPARE: [string, boolean, boolean, boolean][] = [
  ["Records vault with per-document consent", true, true, true],
  ["Renewal and bill reminders", true, true, true],
  ["Monthly report in plain words", true, true, true],
  ["A named coordinator", true, true, true],
  ["Health insurance claims help", false, true, true],
  ["Bills and errands, with your approval", false, true, true],
  ["Weekly WhatsApp check-in", false, true, true],
  ["In-person visits", false, false, true],
  ["Hospital desk support", false, false, true],
  ["Priority response", false, false, true],
];

const STEPS = [
  ["You tell us who to look after", "Add your parent, their language and what worries you. A coordinator calls them to confirm consent in their own words."],
  ["The desk prepares, a person checks", "An assistant reads documents and tracks deadlines. Your coordinator checks everything before it moves."],
  ["You approve, we do", "Payments and filings wait for your yes. Your parent just chats on WhatsApp, in Hindi, Gujarati, Marathi or English."],
];

const WONT = [
  "We do not give medical, legal or tax advice. Doctors, CAs and advocates do, and we say who.",
  "We never pay or file anything without your approval.",
  "We do not hold your money or your parents' money.",
  "We are not an insurer, a broker, a bank or a hospital. We do not sell policies.",
  "We do not take a cut of any claim.",
  "We do not start until your parent has agreed, in their own words, on a call.",
];

const FAQ = [
  ["Does my parent need an app?", "No. They use WhatsApp, in Hindi, Gujarati, Marathi or English. They can send a photo or a voice note."],
  ["Who actually does the work?", "A named coordinator in India. An AI assistant reads documents and tracks dates. A person checks anything it is unsure of, and everything that leaves the desk."],
  ["Will you tell me what to do about a diagnosis, a dispute or my taxes?", "No. We prepare the papers and hand them to a licensed doctor, advocate or CA. What they say is theirs, and we label it that way."],
  ["How are bills paid?", "Today a person completes each payment only after you approve it, and you get 5 minutes to change your mind. We do not hold money."],
  ["Who can see our documents?", "You and your coordinator. Every time someone opens one, it goes in an access log you can read."],
  ["Can I leave?", "Any time. No lock-in. You can download everything, or delete it all, yourself. Your parent can stop by sending STOP on WhatsApp."],
];

function Tick({ on, plan, row }: { on: boolean; plan: string; row: string }) {
  return <span aria-label={`${plan}: ${row}: ${on ? "included" : "not included"}`} className={on ? "font-semibold text-ok" : "text-muted"}>{on ? "Yes" : "No"}</span>;
}

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto grid w-full max-w-[1120px] gap-20 px-4 pb-24">
        <section className="grid gap-6 pt-8 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-12">
          <div>
            <p className="chip" data-tone="accent">For families spread across countries</p>
            <h1 className="mt-4 text-[length:var(--text-display)] font-bold">Mum and Dad are in India. You do not have to be.</h1>
            <p className="mt-4 max-w-xl text-muted">A named person and a careful assistant look after your parents&apos; paperwork, health insurance claims, bills and errands. You see everything. You approve everything.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#waitlist" className="btn btn-primary">Join the waitlist</a>
              <Link href="/signin" className="btn btn-secondary">Sign in</Link>
            </div>
          </div>
          <div>
            <div className="card grid gap-3" aria-label="Example update">
              <span className="chip w-fit" data-tone="warn">1 thing needs you</span>
              <p className="font-semibold">Pay November electricity bill: Rs 4,200</p>
              <p className="text-muted">Prepared by AI, checked by Meera in Rajkot. Nothing is paid until you approve.</p>
              <div className="flex gap-3"><span className="btn btn-primary" aria-hidden>Approve payment</span><span className="btn btn-secondary" aria-hidden>Not now</span></div>
              <p className="text-[length:var(--text-micro)] text-muted">Illustrative example with a fictional family.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="how" className="grid gap-6">
          <h2 id="how" className="text-[length:var(--text-h1)] font-bold">How it works</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map(([t, d], i) => (
              <li key={t}>
                <Reveal delay={i * 0.04}>
                  <div className="card h-full"><span className="chip">{i + 1}</span><h3 className="mt-3 text-[length:var(--text-h3)] font-semibold">{t}</h3><p className="mt-2 text-muted">{d}</p></div>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="pricing" className="grid gap-6">
          <h2 id="pricing" className="text-[length:var(--text-h1)] font-bold">Simple monthly plans</h2>
          <p className="max-w-2xl text-muted">Cancel any time. No visit caps, no lock-in. Prices in US dollars; pilot pricing may change after the first families.</p>
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((p) => (
              <article key={p.name} className="card grid content-start gap-2" style={p.featured ? { borderColor: "var(--accent)", borderWidth: 2 } : undefined}>
                <h3 className="text-[length:var(--text-h3)] font-semibold">{p.name}</h3>
                <p className="text-4xl font-bold">${p.price}<span className="text-[length:var(--text-small)] font-medium text-muted"> / month</span></p>
                <p>{p.blurb}</p>
                <p className="text-muted">{p.note}</p>
              </article>
            ))}
          </div>
          <div role="region" aria-labelledby="compare" tabIndex={0} className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
            <table className="w-full min-w-[560px] text-left text-[length:var(--text-small)]">
              <caption id="compare" className="p-3 text-left font-semibold">Compare plans</caption>
              <thead className="text-muted"><tr><th scope="col" className="p-3">What you get</th>{PLANS.map((p) => <th scope="col" key={p.name} className="p-3">{p.name}</th>)}</tr></thead>
              <tbody>
                {COMPARE.map(([row, a, b, c]) => (
                  <tr key={row} className="border-t border-line">
                    <th scope="row" className="p-3 font-medium">{row}</th>
                    <td className="p-3"><Tick on={a} plan="Lite" row={row} /></td>
                    <td className="p-3"><Tick on={b} plan="Family" row={row} /></td>
                    <td className="p-3"><Tick on={c} plan="Plus" row={row} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="wont" className="card grid gap-3">
          <h2 id="wont" className="text-[length:var(--text-h2)] font-bold">What we will not do</h2>
          <ul className="grid list-disc gap-2 pl-6 text-muted">{WONT.map((w) => <li key={w}>{w}</li>)}</ul>
          <Link className="btn btn-ghost w-fit" href="/trust">How we look after your data</Link>
        </section>

        <section aria-labelledby="faq" className="grid gap-4">
          <h2 id="faq" className="text-[length:var(--text-h1)] font-bold">Questions</h2>
          <div className="grid gap-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card">
                <summary className="flex min-h-12 cursor-pointer items-center font-semibold">{q}</summary>
                <p className="mt-2 text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="founder" className="card grid max-w-3xl gap-3">
          <h2 id="founder" className="text-[length:var(--text-h2)] font-bold">A note from the founder</h2>
          <p>I am Aadit, and I live in Mumbai. Gharsaath is a working name for something I am testing with a small number of families.</p>
          <p>Here is what I am testing: can a named person and a careful assistant take the paperwork off a family&apos;s shoulders, and how many hours does that really take? I am doing the first families myself and logging every minute.</p>
          <p className="text-muted">Some things are not finished. Legal review of claims help and payments is still to be done, and prices may change. I will tell you plainly when something changes.</p>
        </section>

        <section id="waitlist" aria-labelledby="join" className="mx-auto grid w-full max-w-xl gap-4">
          <h2 id="join" className="text-[length:var(--text-h1)] font-bold">Join the waitlist</h2>
          <p className="text-muted">We are starting with a small number of families. Tell us about yours.</p>
          <WaitlistForm />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
