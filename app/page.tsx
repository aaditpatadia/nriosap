import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { WaitlistForm } from "@/components/WaitlistForm";
import { Reveal } from "@/components/Reveal";

const PLANS = [
  { name: "Lite", price: 40, blurb: "Records vault, renewals, monthly report, up to 3 tasks a month.", note: "For parents who are independent." },
  { name: "Family", price: 79, blurb: "Everything in Lite plus claims help, bills and errands, WhatsApp check-ins every week.", note: "Most families choose this.", featured: true },
  { name: "Plus", price: 119, blurb: "Everything in Family plus priority response, in-person visits and hospital desk support.", note: "For parents who need more hands-on help." },
];

const STEPS = [
  ["You tell us who to look after", "Add your parent, their language and what worries you. A coordinator calls them to confirm consent in their own words."],
  ["The desk prepares, a person checks", "An assistant reads documents and tracks deadlines. Your coordinator checks everything before it moves."],
  ["You approve, we do", "Payments and filings wait for your yes. Your parent just chats on WhatsApp, in Hindi, Gujarati, Marathi or English."],
];

const WONT = [
  "We do not give medical, legal or tax advice. Doctors, CAs and advocates do, and we say who.",
  "We never pay or file anything without your approval.",
  "We are not an insurer, a bank or a hospital.",
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto grid w-full max-w-[1120px] gap-20 px-4 pb-24">
        <section className="grid gap-6 pt-8 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-12">
          <div>
            <p className="chip" data-tone="accent">For families spread across countries</p>
            <h1 className="mt-4 text-[length:var(--text-display)] font-bold">Mum and Dad are in India. You do not have to be.</h1>
            <p className="mt-4 max-w-xl text-muted">A named person and a careful assistant look after your parents' paperwork, health insurance claims, bills and errands. You see everything. You approve everything.</p>
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
        </section>

        <section aria-labelledby="wont" className="card grid gap-3">
          <h2 id="wont" className="text-[length:var(--text-h2)] font-bold">What we will not do</h2>
          <ul className="grid gap-2 text-muted">{WONT.map((w) => <li key={w}>{w}</li>)}</ul>
        </section>

        <section id="waitlist" aria-labelledby="join" className="mx-auto grid w-full max-w-xl gap-4">
          <h2 id="join" className="text-[length:var(--text-h1)] font-bold">Join the waitlist</h2>
          <p className="text-muted">We are starting with a small number of families. Tell us about yours.</p>
          <WaitlistForm />
        </section>
      </main>
      <footer className="border-t border-line py-8 text-center text-[length:var(--text-small)] text-muted">
        Gharsaath is a working name. Demo content uses fictional families.
      </footer>
    </>
  );
}
