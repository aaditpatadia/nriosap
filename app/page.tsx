import Link from "next/link";
import { CommandPreview } from "@/components/CommandPreview";
import { GlobalMap } from "@/components/GlobalMap";
import { HeroPreview } from "@/components/HeroPreview";
import { HowItWorks } from "@/components/HowItWorks";
import { IconArrow, IconCheck } from "@/components/Icons";
import { Kinetic } from "@/components/Kinetic";
import { ProblemCards } from "@/components/ProblemCards";
import { Reveal } from "@/components/Reveal";
import { ScrollProgress } from "@/components/ScrollProgress";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { WaitlistForm } from "@/components/WaitlistForm";
import { backendReady } from "@/lib/backend";
import { CATALOGUE } from "@/lib/catalogue";
import { deskChat } from "@/lib/contact";
import { loadPlans } from "@/lib/plans";

// Plan changes made in the Ops console reach this page without a rebuild.
export const revalidate = 300;

const TRUST: [string, string][] = [
  ["Named coordination", "One real person is responsible for your account, and you can see who."],
  ["Clear quotations", "Each quotation separates the provider, our fee and taxes."],
  ["Your approval first", "Nothing is paid, filed or sent until you say yes. You get 5 minutes to undo."],
  ["Document permissions", "You choose what each family member can see, down to a single document."],
  ["Activity history", "Every time someone opens a document, it is written down where you can read it."],
  ["Evidence of completed work", "Requests close with a written report, with photos and receipts where the work has them."],
  ["No unauthorised payments", "Ally does not hold your money. Moving money across borders needs a licensed partner."],
  ["Clear boundaries", "We do not give legal, medical, tax or financial advice. Licensed professionals do."],
];

const FAQ = [
  ["Can I send money home through Ally?", "Not today. Moving money across borders needs a licensed partner, and we are not one. Ally does not hold your money."],
  ["Does my family need an app?", "No. Anyone involved can be added as a contact and reached by your coordinator, in Hindi, Gujarati, Marathi or English."],
  ["Who actually does the work?", "A named coordinator in India, with local providers where the job needs one. You see who it is before you approve the cost."],
  ["Can everything be done remotely?", "No. Some government, bank, legal and insurance steps need you in person, a valid authorisation or a licensed professional. We tell you before you spend anything."],
  ["Will you tell me what to do about a diagnosis, a dispute or my taxes?", "No. We prepare the papers and hand them to a licensed doctor, advocate or CA."],
  ["Can I leave?", "Any time. No lock-in. You can download everything, or delete it all, yourself."],
];

const H2 = "text-[length:var(--text-section)] font-bold tracking-[-0.025em]";

// How the product works. Facts about the rules, not claims about customers.
const FACTS = ["A named person in India", "You approve every cost", "Proof for every step", "Cancel any time"];

export default async function Home() {
  const plans = await loadPlans();
  return (
    <>
      <ScrollProgress />
      <SiteHeader />
      <main id="main">
        <section className="atmos wrap grid gap-10 py-12 lg:min-h-[calc(100vh-74px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center lg:gap-14">
          <div>
            <h1 className="text-[length:var(--text-display)] font-bold leading-[1.05]"><Kinetic text="Your life is abroad. Your responsibilities don't have to be." start={60} /></h1>
            <p className="rise mt-6 max-w-xl text-[1.125rem] text-muted">From property and paperwork to family responsibilities and everyday tasks, Ally helps you organise and get things done back home in India.</p>
            <div className="rise mt-8 flex flex-wrap gap-3">
              <Link href="/signin" className="btn btn-primary">Get started with Ally <IconArrow className="arrow" /></Link>
              <a href="#how" className="btn btn-secondary min-h-14">Explore how it works</a>
            </div>
            <ul className="facts rise mt-8 max-w-lg" aria-label="How Ally works, in short">
              {FACTS.map((f) => <li key={f}><IconCheck size={18} />{f}</li>)}
            </ul>
          </div>
          <div className="rise"><HeroPreview /></div>
        </section>

        <section aria-labelledby="problem" className="wrap grid gap-8 py-16 lg:py-24">
          <div className="grid max-w-3xl gap-3">
            <span className="eyebrow">The problem</span>
            <h2 id="problem" className={H2}>You left. The responsibilities didn&apos;t.</h2>
            <p className="text-muted">You are not short of apps. You are short of one reliable person, and one clear view of what is going on.</p>
          </div>
          <ProblemCards />
        </section>

        <section aria-labelledby="reach" className="wrap grid gap-8 pb-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center lg:pb-24">
          <div className="grid max-w-xl gap-3">
            <span className="eyebrow">Wherever you live</span>
            <h2 id="reach" className={H2}>From your time zone to theirs.</h2>
            <p className="text-muted">Send the task from London, Toronto, Dubai or Singapore. A person in India picks it up during their working day, and you see every step when you wake up.</p>
          </div>
          <Reveal><div className="band rounded-[20px] p-5 sm:p-7" style={{ boxShadow: "var(--shadow-lg)" }}><GlobalMap /></div></Reveal>
        </section>

        <section aria-labelledby="services" className="wrap grid gap-8 bg-sunken py-16 lg:py-24">
          <div className="grid max-w-3xl gap-3">
            <span className="eyebrow">Services</span>
            <h2 id="services" className={H2}>What Ally handles</h2>
            <p className="text-muted">We coordinate the work. Some steps still need you in person, a valid authorisation or a licensed professional, and we say so before you spend anything.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
            {CATALOGUE.map((c) => (
              <details key={c.title} className="card">
                <summary className="flex min-h-12 cursor-pointer items-center font-semibold">{c.title}</summary>
                <dl className="mt-2 grid gap-2 text-[length:var(--text-small)]">
                  {[["The problem", c.problems], ["What Ally can coordinate", c.coordinate], ["What you approve", c.approves], ["The proof you get", c.proof]].map(([k, v]) => <div key={k}><dt className="font-semibold">{k}</dt><dd className="text-muted">{v}</dd></div>)}
                </dl>
                <p className="mt-3 text-[length:var(--text-small)] text-warn">{c.limit}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="wrap grid gap-8 py-16 lg:py-24">
          <div className="grid gap-3"><span className="eyebrow">How it works</span><h2 id="how-title" className={H2}>How Ally works</h2></div>
          <HowItWorks />
        </section>

        <section aria-labelledby="command" className="wrap grid gap-8 bg-sunken py-16 lg:py-24">
          <div className="grid max-w-3xl gap-3">
            <span className="eyebrow">Your dashboard</span>
            <h2 id="command" className={H2}>One place for everything back home</h2>
            <p className="text-muted">Built from the same parts as the real dashboard. Try approving the quotation.</p>
          </div>
          <CommandPreview />
        </section>

        <section aria-labelledby="trust" className="band wrap grid gap-10 py-16 lg:py-24">
          <h2 id="trust" className={`${H2} max-w-3xl`}>Trust is built into how the work is done.</h2>
          <ul className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map(([t, d], i) => <li key={t} className="border-t border-line py-5"><Reveal delay={Math.min(i, 5) * 0.04}><h3 className="font-semibold">{t}</h3><p className="mt-1 text-[length:var(--text-small)] text-muted">{d}</p></Reveal></li>)}
          </ul>
          <Link className="btn btn-secondary w-fit" href="/trust">How we look after your data <IconArrow className="arrow" /></Link>
        </section>

        <section aria-labelledby="pricing" className="wrap grid gap-8 py-16 lg:py-24">
          <div className="grid max-w-3xl gap-3">
            <span className="eyebrow">Pricing</span>
            <h2 id="pricing" className={H2}>Simple monthly plans</h2>
            <p className="text-muted">Your subscription pays for coordination. Provider fees, government charges and other third-party costs are quoted separately for your approval. Prices in US dollars. Cancel any time.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((p, i) => (
              <Reveal key={p.slug} delay={i * 0.06}>
                <article className="card lift grid h-full content-start gap-4 p-6" style={p.featured ? { background: "var(--mint)", borderColor: "var(--mint-line)" } : undefined}>
                  <div className="flex items-center justify-between gap-2"><h3 className="text-[length:var(--text-h2)] font-bold">{p.name}</h3>{p.featured && <span className="chip" data-tone="accent">A good place to start</span>}</div>
                  <p className="text-5xl font-bold tracking-tight">${p.priceUsd}<span className="text-[length:var(--text-small)] font-medium tracking-normal text-muted"> / month</span></p>
                  {!p.featured && <p className="text-[length:var(--text-small)] text-muted">{p.blurb}</p>}
                  <ul className="grid gap-2 text-[length:var(--text-small)]">{p.features.map((f) => <li key={f} className="flex gap-2"><IconCheck size={18} className="mt-0.5 shrink-0 text-accent" />{f}</li>)}</ul>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq" className="wrap grid gap-8 bg-sunken py-16 lg:grid-cols-[1fr_2fr] lg:py-24">
          <h2 id="faq" className={`${H2} lg:sticky lg:top-28 lg:self-start`}>Questions</h2>
          <div className="grid content-start gap-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card">
                <summary className="flex min-h-12 cursor-pointer items-center font-semibold">{q}</summary>
                <p className="mt-1 text-[length:var(--text-small)] text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="waitlist" aria-labelledby="join" className="band wrap grid gap-8 py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <div className="grid content-start gap-5">
            <h2 id="join" className={H2}>India is still home. Let Ally help take care of the details.</h2>
            <div className="flex flex-wrap gap-3">
              <Link href="/signin" className="btn btn-primary w-fit">Get started <IconArrow className="arrow" /></Link>
              <a href={deskChat("Hi Ally, I would like to know more.")} target="_blank" rel="noopener noreferrer" className="btn btn-secondary w-fit min-h-14">Talk to a person on WhatsApp</a>
            </div>
            <p className="text-muted">Not ready yet? Leave your details and we will write to you.</p>
          </div>
          <div>
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
