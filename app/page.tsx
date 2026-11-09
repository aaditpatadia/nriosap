import Link from "next/link";
import { CommandPreview } from "@/components/CommandPreview";
import { GlobalMap } from "@/components/GlobalMap";
import { IconArrow } from "@/components/Icons";
import { JourneyRail } from "@/components/JourneyRail";
import { Kinetic } from "@/components/Kinetic";
import { ProblemCards } from "@/components/ProblemCards";
import { Reveal } from "@/components/Reveal";
import { ScrollProgress } from "@/components/ScrollProgress";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { TiltCard } from "@/components/TiltCard";
import { VaultGraphic } from "@/components/VaultGraphic";
import { WaitlistForm } from "@/components/WaitlistForm";
import { backendReady } from "@/lib/backend";
import { CATALOGUE } from "@/lib/catalogue";

const PLANS = [
  { name: "Lite", price: 40, blurb: "Document vault, renewals, monthly report, up to 3 tasks a month.", note: "For a few things a month." },
  { name: "Family", price: 79, blurb: "Everything in Lite plus bills, errands, property and paper chasing, claims help and weekly WhatsApp updates.", note: "A good place to start.", featured: true },
  { name: "Plus", price: 119, blurb: "Everything in Family plus priority response, in-person visits and hospital desk support.", note: "When you need someone on the ground." },
];

const STEPS = [
  ["Request", "Tell Ally what needs to be done, in your own words."],
  ["Understand", "Ally organises the details and asks for anything missing."],
  ["Coordinate", "A human coordinator identifies the right local person or service provider."],
  ["Approve", "You receive the quotation and approve the work. Nothing happens before that."],
  ["Execute", "The work gets done, and you can see who has it at every step."],
  ["Verify", "You receive photographs, documents, receipts and a completion report."],
];

const TRUST: [string, string][] = [
  ["Named coordinators", "One real person is responsible for your account, and you can see who."],
  ["Providers named on every request", "You see who is doing the work before you approve it. A formal provider verification programme is not built yet."],
  ["Explicit approvals", "Nothing is paid, filed or sent until you say yes. You get 5 minutes to undo."],
  ["Document-level permissions", "You choose what each family member can see, down to a single document."],
  ["Private document storage", "Files sit in private storage and open through links that expire in 60 seconds. Sensitive details are encrypted."],
  ["Activity logs", "Every time someone opens a document, it is written down where you can read it."],
  ["Transparent service fees", "Each quotation separates the provider, our fee and taxes."],
  ["Proof of completion", "Requests close with a written report, with photos and receipts where the work has them."],
  ["Human verification", "AI prepares. A person checks anything it is less than 90% sure of."],
];

const FAQ = [
  ["Can I send money home through Ally?", "Not yet. Moving money across borders needs a licensed partner, and we are not one. Today we can arrange a payment in India, and a person completes it only after you approve."],
  ["Does my family need an app?", "No. Anyone involved can use WhatsApp, in Hindi, Gujarati, Marathi or English. They can send a photo or a voice note."],
  ["Who actually does the work?", "A named coordinator in India, with local providers where the job needs one. An AI assistant reads documents and tracks dates. A person checks everything that leaves the desk."],
  ["Will you tell me what to do about a diagnosis, a dispute or my taxes?", "No. We prepare the papers and hand them to a licensed doctor, advocate or CA. What they say is theirs, and we label it that way."],
  ["Can I leave?", "Any time. No lock-in. You can download everything, or delete it all, yourself."],
  ["Is this only for India?", "India comes first. We plan to add other countries once this works well here."],
];

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <SiteHeader />
      <main id="main">
        <section className="band wrap relative grid gap-10 overflow-hidden py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-center md:gap-12 lg:min-h-[calc(100vh-74px)]">
          <span aria-hidden className="aurora" />
          <div className="relative">
            <p className="chip rise" data-tone="accent">For Indians living abroad</p>
            <h1 className="mt-5 text-[length:var(--text-display)] font-extrabold"><Kinetic text="Anything you need done in India. Done." start={80} /></h1>
            <p className="rise mt-5 max-w-2xl text-[length:var(--text-h3)]">Your home, family, property and responsibilities don&apos;t have to stay on your shoulders when you&apos;re thousands of miles away.</p>
            <p className="rise mt-3 max-w-2xl text-muted">From managing property and paperwork to getting everyday tasks completed, Ally connects you with people on the ground in India. You stay informed. You approve everything. We handle the execution.</p>
            <div className="rise mt-7 flex flex-wrap gap-3">
              <Link href="/signin" className="btn btn-primary">Get Started <IconArrow className="arrow" /></Link>
              <a href="#how" className="btn btn-secondary">See How Ally Works</a>
            </div>
          </div>
          <div className="rise relative"><GlobalMap /></div>
        </section>

        <section aria-labelledby="problem" className="wrap grid gap-8 py-16 lg:py-24">
          <h2 id="problem" className="max-w-4xl text-[length:var(--text-display)] font-extrabold">Being away shouldn&apos;t mean being out of control.</h2>
          <ProblemCards />
        </section>

        <section aria-labelledby="services" className="wrap grid gap-8 bg-tint py-16 lg:py-24">
          <div className="grid gap-2">
            <h2 id="services" className="text-[length:var(--text-display)] font-extrabold">What Ally handles</h2>
            <p className="max-w-2xl text-muted">We coordinate and carry out the work. Legal, medical, financial and tax advice comes from licensed professionals.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
            {CATALOGUE.map((c) => (
              <details key={c.title} className="card">
                <summary className="flex min-h-12 cursor-pointer items-center text-[length:var(--text-h3)] font-semibold">{c.title}</summary>
                <dl className="mt-3 grid gap-2">
                  {[["Common problems", c.problems], ["What Ally can coordinate", c.coordinate], ["What we need from you", c.needed], ["What you approve", c.approves], ["The proof you get", c.proof]].map(([k, v]) => <div key={k}><dt className="text-[length:var(--text-small)] font-semibold">{k}</dt><dd className="text-muted">{v}</dd></div>)}
                </dl>
                <p className="mt-3 text-[length:var(--text-small)] text-warn">{c.limit}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="wrap grid gap-10 py-16 lg:grid-cols-[1fr_2fr] lg:py-24">
          <h2 id="how-title" className="text-[length:var(--text-display)] font-extrabold lg:sticky lg:top-28 lg:self-start">How Ally works</h2>
          <JourneyRail steps={STEPS} />
        </section>

        <section aria-labelledby="command" className="wrap grid gap-8 bg-tint py-16 lg:py-24">
          <div className="grid gap-2">
            <h2 id="command" className="text-[length:var(--text-display)] font-extrabold">The Ally Command Centre</h2>
            <p className="max-w-2xl text-muted">Everything in one place. Click around. Try approving the quotation.</p>
          </div>
          <CommandPreview />
        </section>

        <section aria-labelledby="trust" className="band wrap relative grid gap-10 overflow-hidden py-16 lg:py-24">
          <span aria-hidden className="aurora" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <h2 id="trust" className="text-[length:var(--text-display)] font-extrabold">Thousands of miles away. Still in control.</h2>
            <VaultGraphic />
          </div>
          <ul className="relative grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {TRUST.map(([t, d], i) => <li key={t}><Reveal delay={i * 0.03}><div className="h-full rounded-[var(--radius-control)] bg-surface p-4"><h3 className="font-semibold">{t}</h3><p className="mt-1 text-muted">{d}</p></div></Reveal></li>)}
          </ul>
          <Link className="btn btn-secondary relative w-fit" href="/trust">How we look after your data <IconArrow className="arrow" /></Link>
        </section>

        <section aria-labelledby="pricing" className="wrap grid gap-8 py-16 lg:py-24">
          <div className="grid gap-2">
            <h2 id="pricing" className="text-[length:var(--text-display)] font-extrabold">Simple monthly plans</h2>
            <p className="max-w-2xl text-muted">Cancel any time. Prices in US dollars; pilot pricing may change after the first families. Third-party costs are quoted separately for your approval.</p>
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
        </section>

        <section aria-labelledby="faq" className="wrap grid gap-8 bg-tint py-16 lg:grid-cols-[1fr_2fr] lg:py-24">
          <h2 id="faq" className="text-[length:var(--text-display)] font-extrabold lg:sticky lg:top-28 lg:self-start">Questions</h2>
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
          <div className="relative grid content-start gap-5">
            <h2 id="join" className="text-[length:var(--text-display)] font-extrabold">Everything back home. One place.</h2>
            <Link href="/signin" className="btn btn-primary w-fit">Get Started with Ally <IconArrow className="arrow" /></Link>
            <p className="text-muted">Not ready yet? Leave your details and we will write to you.</p>
          </div>
          <div className="relative">
            {backendReady() ? <WaitlistForm /> : (
              <div className="card grid content-start gap-3">
                <p className="font-semibold">The waitlist opens soon.</p>
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
