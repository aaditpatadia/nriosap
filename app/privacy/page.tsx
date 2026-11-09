import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { PageHero } from "@/components/PageHero";

export const metadata = { title: "Privacy policy", description: "What Ally collects, why, who handles it, and how you can see it, take it with you or delete it." };

const UPDATED = "9 November 2026";

type Section = { title: string; body?: string; points?: string[] };

const SECTIONS: Section[] = [
  {
    title: "What we collect about you",
    points: [
      "Your name and email address, so you can sign in.",
      "Your WhatsApp number, and the name, phone number and preferred language of anyone you ask us to help.",
      "The approvals you give or refuse, and your choices about consent.",
      "Your plan and billing status.",
      "If you join the waitlist: your email, your country and any note you add.",
    ],
  },
  {
    title: "What we collect to do the work",
    points: [
      "Documents you or your family share, such as property papers, IDs, bills, insurance policies and hospital papers. Some of these hold health details.",
      "Policy numbers, dates and amounts read from those documents.",
      "WhatsApp messages, photos, files and voice notes sent to the desk, and what you ask us to do.",
      "Tasks, claims and the time our coordinators spend on your requests.",
    ],
  },
  {
    title: "Why we use it",
    points: [
      "To do what you ask: run errands, track bills and renewals, and prepare claims and forms.",
      "To show you what was done and how many hours it took.",
      "To ask for your approval before any money goes out or anything is filed.",
      "To keep the service safe and to fix faults.",
    ],
    body: "We do not sell your data. We do not use it for advertising. We do not give medical, legal or tax advice.",
  },
  {
    title: "If you sign in with Google",
    body: "Google shares your name, email address and profile picture with us. We use them only to create your account and sign you in. We do not ask for access to your Gmail, Drive, Contacts or Calendar, and we do not sell or share what Google sends us for any other purpose.",
  },
  {
    title: "Consent",
    points: [
      "We ask for each purpose separately, and for each document.",
      "If someone else is involved, a coordinator calls them in their own language before work starts.",
      "Anyone involved can stop at any time by sending STOP on WhatsApp. Work for them stops and your coordinator confirms it with you.",
    ],
  },
  {
    title: "Who can see it",
    body: "You, the coordinator assigned to your family, and the founder when checking the work. Each time someone opens a document or a policy, it goes in an access log you can read.",
  },
  {
    title: "How we protect it",
    points: [
      "Policy numbers and details read from documents are encrypted before they are stored, with a separate key for each family.",
      "Files sit in private storage and open through links that expire in 60 seconds.",
      "Each family's records are walled off from every other family's in the database.",
      "Names, numbers and health words are stripped from error reports before they leave our server.",
    ],
    body: "No system is perfectly safe. If a breach affects you, we will tell you.",
  },
  {
    title: "Where it is stored and how long we keep it",
    points: [
      "We are confirming where data is stored and will say so here.",
      "Reading a document or a voice note can send it outside India. Our document reading provider is one example.",
      "We keep your data until you delete it or your family leaves. We have not set fixed time limits yet.",
    ],
  },
  {
    title: "Your choices",
    points: [
      "See everything we hold, including the access log, on the Privacy page in your family's space.",
      "Download your family's data as a file or a ZIP.",
      "Delete your family's data yourself. Files and records are removed, and your account too if you have no other family with us.",
      "Ask your coordinator to correct anything that is wrong.",
    ],
    body: "After deletion we keep only a log of ids and actions, as proof of what happened. It holds no documents. Any backups kept by our hosting provider are cleared on that provider's schedule.",
  },
  {
    title: "Cookies and your browser",
    body: "We use one kind of cookie: the one that keeps you signed in. Your browser also remembers if you chose larger text. We use no advertising cookies and no analytics trackers.",
  },
];

const PROVIDERS: [string, string][] = [
  ["Supabase", "Database, private file storage and sign-in"],
  ["Vercel", "Runs the website"],
  ["Google", "Sign-in, if you choose it"],
  ["Anthropic", "AI that reads documents to pull out dates and amounts"],
  ["Sarvam", "Turns voice notes into text"],
  ["Meta (WhatsApp)", "Carries messages to and from the desk"],
  ["Stripe", "Subscription billing. We never hold your card number"],
  ["Sentry", "Error reports, with personal details removed"],
  ["Inngest", "Runs timed background jobs"],
];

export default function Privacy() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <PageHero title="Privacy policy" lead={<p>What we hold about you and your family, why we hold it, and how you stay in charge of it. Last updated {UPDATED}.</p>} />
        <div className="wrap grid gap-6 pb-24 pt-8">
        <section className="card grid gap-1 border-warn" aria-labelledby="draft-notice">
          <h2 id="draft-notice" className="text-[length:var(--text-h3)] font-semibold text-warn">This is a draft</h2>
          <p className="text-muted">A lawyer has not reviewed this policy yet, and we are not open to families. Ally is a working name. We will add our legal name and a contact address here before we open.</p>
        </section>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SECTIONS.map((s) => (
            <section key={s.title} className="card xl:last:col-span-3">
              <h2 className="text-[length:var(--text-h3)] font-semibold">{s.title}</h2>
              {s.points && (
                <ul className="mt-2 grid list-disc gap-1 pl-6 text-muted">
                  {s.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              {s.body && <p className="mt-2 text-muted">{s.body}</p>}
            </section>
          ))}
        </div>
        <section className="card grid gap-3" aria-labelledby="providers">
          <div>
            <h2 id="providers" className="text-[length:var(--text-h3)] font-semibold">Companies that handle data for us</h2>
            <p className="mt-1 text-muted">Some of these are not switched on yet: automatic WhatsApp sending is off, and billing runs in test mode, so no real card is charged.</p>
          </div>
          <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
            {PROVIDERS.map(([name, job]) => (
              <div key={name}>
                <dt className="font-semibold">{name}</dt>
                <dd className="text-muted">{job}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="card grid gap-1">
          <h2 className="text-[length:var(--text-h3)] font-semibold">Questions and changes</h2>
          <p className="text-muted">
            If you are with us, your coordinator can help with any question about your data. If this policy changes, we will update the date at the top and tell families before a change affects them. For a shorter version, read{" "}
            <Link className="underline" href="/trust">how we look after your family</Link>.
          </p>
        </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
