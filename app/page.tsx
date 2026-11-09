import Link from "next/link";
import { HeroScene } from "@/components/HeroScene";
import { IconArrow } from "@/components/Icons";
import { JourneyRail } from "@/components/JourneyRail";
import { Kinetic } from "@/components/Kinetic";
import { Reveal } from "@/components/Reveal";
import { ScrollProgress } from "@/components/ScrollProgress";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ThreadArc } from "@/components/ThreadArc";
import { TiltCard } from "@/components/TiltCard";
import { VaultGraphic } from "@/components/VaultGraphic";
import { WaitlistForm } from "@/components/WaitlistForm";
import { WorryPicker } from "@/components/WorryPicker";
import { backendReady } from "@/lib/backend";

const PLANS = [
  { name: "Lite", price: 40, blurb: "Records vault, renewals, monthly report, up to 3 tasks a month.", note: "For parents who are independent." },
  { name: "Family", price: 79, blurb: "Everything in Lite plus claims help, bills and errands, WhatsApp check-ins every week.", note: "A good place to start.", featured: true },
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

const TICKER = ["Electricity bills", "Health insurance claims", "Policy renewals", "Hospital papers", "Property tax receipts", "Repair visits", "Voice notes in Gujarati", "Pharmacy runs", "Monthly reports", "Gas connections"];

function Tick({ on, plan, row }: { on: boolean; plan: string; row: string }) {
  return <span aria-label={`${plan}: ${row}: ${on ? "included" : "not included"}`} className={on ? "font-semibold text-ok" : "text-muted"}>{on ? "Yes" : "No"}</span>;
}

function Ticker({ hidden }: { hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {TICKER.map((t) => <li key={t} className="flex items-center gap-8 pr-8 text-[length:var(--text-h3)] font-bold"><span>{t}</span><span aria-hidden className="size-2 rounded-full bg-ink" /></li>)}
    </ul>
  );
}

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <SiteHeader />
      <main id="main">
        <section className="band wrap relative grid gap-10 overflow-hidden py-12 md:grid-cols-[1.15fr_1fr] md:items-center md:gap-14 lg:min-h-[calc(100vh-74px)]">
          <span aria-hidden className="aurora" />
          <div className="relative">
            <p className="chip rise" data-tone="accent">For families spread across countries</p>
            <h1 className="mt-5 text-[length:var(--text-display)] font-extrabold"><Kinetic text="Mum and Dad are in India. You do not have to be." start={80} /></h1>
            <p className="rise mt-5 max-w-2xl text-muted">A named person and a careful assistant look after your parents&apos; paperwork, health insurance claims, bills and errands. You see everything. You approve everything.</p>
            <div className="rise mt-7 flex flex-wrap gap-3">
              <Link href="/demo" className="btn btn-primary">Try the live demo <IconArrow className="arrow" /></Link>
              <a href="#waitlist" className="btn btn-secondary">Join the waitlist</a>
              <Link href="/signin" className="btn btn-secondary">Sign in</Link>
            </div>
            <ThreadArc className="rise mt-8 max-w-xl" />
          </div>
          <HeroScene />
        </section>

        <div className="band-marigold marquee py-4" tabIndex={0} role="group" aria-label="Things the desk looks after">
          <div className="marquee-track">
            <Ticker />
            <Ticker hidden />
          </div>
        </div>

        <section aria-labelledby="worry" className="wrap grid gap-8 py-16 lg:py-24">
          <div className="grid gap-2">
            <h2 id="worry" className="text-[length:var(--text-display)] font-extrabold">What is on your mind tonight?</h2>
            <p className="max-w-2xl text-muted">Pick one. See who does what, and where you stay in charge.</p>
          </div>
          <WorryPicker />
        </section>

        <section aria-labelledby="how" className="wrap grid gap-10 bg-tint py-16 lg:grid-cols-[1fr_2fr] lg:py-24">
          <h2 id="how" className="text-[length:var(--text-display)] font-extrabold lg:sticky lg:top-28 lg:self-start">How it works</h2>
          <JourneyRail steps={STEPS} />
        </section>

        <section aria-labelledby="pricing" className="wrap grid gap-8 py-16 lg:py-24">
          <div className="grid gap-2">
            <h2 id="pricing" className="text-[length:var(--text-display)] font-extrabold">Simple monthly plans</h2>
            <p className="max-w-2xl text-muted">Cancel any time. No visit caps, no lock-in. Prices in US dollars; pilot pricing may change after the first families.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((p, i) => (
              <Reveal key={p.name} delay={i * 0.06}>
                <TiltCard className={`grid h-full content-start gap-3 rounded-[var(--radius-card)] border border-line p-6 ${p.featured ? "band" : "bg-surface"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[length:var(--text-h2)] font-bold">{p.name}</h3>
                    {p.featured && <span className="chip" data-tone="accent">{p.note}</span>}
                  </div>
                  <p className="text-6xl font-extrabold tracking-tight">${p.price}<span className="text-[length:var(--text-small)] font-medium tracking-normal text-muted"> / month</span></p>
                  <p>{p.blurb}</p>
                  {!p.featured && <p className="text-muted">{p.note}</p>}
                </TiltCard>
              </Reveal>
            ))}
          </div>
          <div role="region" aria-labelledby="compare" tabIndex={0} className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
            <table className="w-full text-left text-[length:var(--text-small)]">
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

        <section aria-labelledby="wont" className="band wrap relative grid items-center gap-10 overflow-hidden py-16 lg:grid-cols-[1fr_1.4fr] lg:py-24">
          <span aria-hidden className="aurora" />
          <div className="relative"><VaultGraphic /></div>
          <div className="relative grid content-start gap-4">
            <h2 id="wont" className="text-[length:var(--text-display)] font-extrabold">What we will not do</h2>
            <ul className="grid gap-3 md:grid-cols-2">{WONT.map((w, i) => <li key={w}><Reveal delay={i * 0.04}><p className="h-full rounded-[var(--radius-control)] bg-surface p-4">{w}</p></Reveal></li>)}</ul>
            <Link className="btn btn-secondary w-fit" href="/trust">How we look after your data <IconArrow className="arrow" /></Link>
          </div>
        </section>

        <section aria-labelledby="faq" className="wrap grid gap-8 py-16 lg:grid-cols-[1fr_2fr] lg:py-24">
          <div className="grid content-start gap-6 lg:sticky lg:top-28 lg:self-start">
            <h2 id="faq" className="text-[length:var(--text-display)] font-extrabold">Questions</h2>
            <section aria-labelledby="founder" className="card grid gap-2">
              <h3 id="founder" className="text-[length:var(--text-h3)] font-semibold">A note from the founder</h3>
              <p>I am Aadit, and I live in Mumbai. Ally is a working name for something I am testing with a small number of families.</p>
              <p>Can a named person and a careful assistant take the paperwork off a family&apos;s shoulders, and how many hours does that really take? I am doing the first families myself and logging every minute.</p>
              <p className="text-muted">Some things are not finished. Legal review of claims help and payments is still to be done, and prices may change. I will tell you plainly when something changes.</p>
            </section>
          </div>
          <div className="grid content-start gap-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card">
                <summary className="flex min-h-12 cursor-pointer items-center font-semibold">{q}</summary>
                <p className="mt-2 text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="waitlist" aria-labelledby="join" className="band wrap relative grid gap-8 overflow-hidden py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <span aria-hidden className="aurora" />
          <div className="relative">
            <h2 id="join" className="text-[length:var(--text-display)] font-extrabold">Join the waitlist</h2>
            <p className="mt-3 text-muted">We are starting with a small number of families. Tell us about yours.</p>
            <ThreadArc className="mt-8 max-w-xl" />
          </div>
          <div className="relative">
            {backendReady() ? <WaitlistForm /> : (
              <div className="card grid content-start gap-3">
                <p className="font-semibold">The waitlist opens soon.</p>
                <p className="text-muted">Until then, see how it works for a family.</p>
                <Link href="/demo" className="btn btn-primary w-fit">Try the live demo</Link>
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
