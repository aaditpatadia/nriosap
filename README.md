# Ally (working name)

The working tool for the 30 day concierge: an India desk for NRIs whose parents need paperwork, health insurance claims, records, bills and errands handled. AI prepares and tracks. A named coordinator checks and acts. The number that decides the business is hours per family.

Assumptions and decisions are in `NOTES.md`. History is in `CHANGELOG.md`.

## Screens

| Route | Who | What |
|---|---|---|
| `/`, `/trust` | Public | Marketing, plan comparison, FAQ, what we will not do, founder note, waitlist |
| `/demo` | Public, no account | Live walk-through with a fictional family. Runs only in the browser |
| `/signin` | Everyone | Google or magic link for owners, email and password for the desk |
| `/onboarding` | Owner | Add a parent, choose a plan, consent per purpose |
| `/family/[id]` | Owner, assigned coordinator, admin | Overview, claims, documents, calendar, approvals, report, billing, privacy |
| `/ops` | Coordinator, admin | Queue with filters, alerts, running timer |
| `/ops/task/[id]` | Staff | Timer, manual time, notes, checklist, escalation, ask for approval |
| `/ops/families` | Staff | Hours, margin, budget and SLA flags, weekly trend, CSV |
| `/ops/new`, `/ops/onboard`, `/ops/consent/[id]`, `/ops/messages/[id]`, `/ops/documents/[id]` | Staff | Templates, onboarding, consent call, WhatsApp thread, field check |
| `/chat/[id]` | Demo only | Simulated parent chat, only when `DEMO_MODE=1` |

## Local stack (no accounts needed)

This runs real Postgres from npm, plus a local stand-in for Supabase Auth and Storage and fake third-party APIs. Requires Node 24 and Chrome.

```bash
npm install
npm run lint:setup
npm test
npm run test:db
npm run local:build
npx playwright test
```

To click around, run these in two terminals, then open http://localhost:3100:

```bash
npm run local:stack
```

```bash
npm run local:dev
```

On `/signin`, use the **Try the demo** buttons to open as an owner, a coordinator or an admin. They appear only when `DEMO_MODE=1` and Supabase points at the local emulator, so they can never show on a real project. Any other email in the family form creates a new owner, and the page gives you the link because nothing is emailed locally.

## Deploy to Vercel and Supabase

1. Create a Supabase project. Choose the Mumbai region if available.
2. Apply `supabase/migrations/001` to `009` in order, in the SQL editor or with `supabase db push`. Never apply `supabase/local/`.
3. In Supabase Auth, turn on email. Set the Site URL to your domain and add `https://YOUR-DOMAIN/auth/callback` to the redirect URLs.
4. Copy `.env.example` to `.env.local` and fill it in. Use the transaction pooler string (port 6543) for `DATABASE_URL`.
5. Create the private bucket:

```bash
node --env-file=.env.local scripts/setup-storage.mjs
```

6. Create your own admin and coordinator accounts. The password comes from `STAFF_PASSWORD` and must be 12 characters or more:

```bash
npm run user:create -- you@example.com "Your Name" admin Mumbai
```

7. Optional demo family: set `DEMO_MODE=1` and `SEED_STAFF_PASSWORD`, then run `npm run db:seed`.
8. Import the repo in Vercel (this folder is the repo root), add the same env vars, deploy.
9. WhatsApp: in Meta, set the webhook to `https://YOUR-DOMAIN/api/whatsapp` with your verify token, and subscribe to `messages`. Leave `WHATSAPP_SEND_ENABLED=0` until business verification is done.
10. Stripe: in test mode, create three monthly prices ($40, $79, $119) and set `STRIPE_PRICE_40`, `_79`, `_119`. Add a webhook to `https://YOUR-DOMAIN/api/stripe` for `checkout.session.completed` and `customer.subscription.*`.
11. Inngest: connect the app at `https://YOUR-DOMAIN/api/inngest` and set `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY`.

Vercel deploys every push to `main`. Until the database variables are set, `/signin` and the waitlist say they are not open yet, and `/demo` works without them. Environment changes need a redeploy, because some pages are built ahead of time.

### Turn on Google sign-in

1. In Google Cloud, create an OAuth client (Web application). Add `https://YOUR-PROJECT.supabase.co/auth/v1/callback` as an authorised redirect URI.
2. In Supabase, go to Auth, then Providers, then Google. Paste the client ID and secret, and enable it.
3. In Supabase Auth URL settings, set the Site URL to your domain and add `https://YOUR-DOMAIN/**` to the redirect URLs.
4. In Vercel, set `GOOGLE_SIGNIN=1`, then redeploy.

New Google accounts always start as family owners. Desk roles are only given with `npm run user:create`.

## Security settings to set before launch

- `INNGEST_SIGNING_KEY`: required on Vercel. Without it the job endpoint stays shut and no scheduled job runs.
- `DATABASE_CA_CERT`: base64 of the Supabase CA certificate, so the server identity is verified as well as encrypted.
- `SENTRY_DSN`: repeated failed sign-ins always appear on the ops page for admins. With this set, Sentry can email you too.
- `VIRUS_SCAN_URL`: without a real scanner only the standard test file is caught.
- In Supabase, turn on leaked password protection and keep email confirmations on. Check the Auth rate limits.

## Environment variables

See `.env.example`, which documents each one. The app runs with only the Supabase, database, `APP_URL` and `APP_ENCRYPTION_KEY` values. Everything else switches a feature on.

## Real and mocked

| Area | State |
|---|---|
| Postgres, RLS, audit log, consent records, approvals with undo | Real. Tested on real Postgres 17 |
| Supabase Auth and Storage | Real client code. Tested against a local emulator, not a real project |
| Google sign-in | Real client code. Tested with the emulator standing in for Google, not real Google |
| `/demo` | A scripted simulation on purpose. Uses the real message rules. Nothing leaves the browser |
| Field encryption, signed links, upload checks | Real |
| Document extraction | Real Claude API code. Tested against a fake API, so real accuracy is unknown |
| Virus scan | Hook is real. Without `VIRUS_SCAN_URL` it only catches the EICAR test file and marks files `basic_only` |
| WhatsApp inbound | Real code. Tested with signed test payloads, not real Meta traffic |
| WhatsApp outbound | Real code behind `WHATSAPP_SEND_ENABLED`, which is off |
| Voice transcription | Sarvam adapter written from their docs. Mock until `SARVAM_API_KEY` is set |
| Third-party payments | Stub only. `PaymentPartner` records a step. No money moves |
| Subscription billing | Stripe test mode only. Live keys are refused |
| Background jobs | Real job logic, tested on Postgres. Inngest scheduling itself not exercised |
| Sentry | Server only, scrubbed. Scrubbing tested, sending not |

## What you must do yourself

1. Lawyer review of the payments and claims-help boundaries (research report section 4.2).
2. DPDP consent wording, and native review of the Hindi, Gujarati and Marathi call scripts in `lib/consent.ts`. They are drafts. Include cross-border AI processing.
3. Licence Avantt from Displaay, then change `app/fonts.ts`. Do not use an unlicensed copy.
4. WhatsApp business verification and Meta template approval (`doc_reminder`, `task_update`).
5. Partner agreements with a CA, an advocate and hospital desks. Then add them to `partner_contacts`.
6. The first 10 customer interviews, in person, as the research says.
7. Add a real virus scanner before real families upload files.
8. Run the app against a real Supabase project and re-run the checks in `NOTES.md`.
