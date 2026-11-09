# Changelog

## Going live
- Every page now runs the full width of the screen, with colour bands and wider grids.
- Added `/demo`: a public, no-account walk-through with a fictional family. It runs in the browser only.
- Added Google sign-in behind `GOOGLE_SIGNIN`. New Google accounts start as owners.
- With no database settings, sign-in and the waitlist now say they are not open yet instead of failing.

## Quality pass
- Migration 008 removes insert rights user sessions did not need, and tightens alert updates.
- Staff views of tasks, messages and consent records now write to the audit log.
- Alerts can be cleared, and SLA alerts clear themselves when the task is done.
- Fixed phone overflow on documents, plan table columns on phones, small touch target in ops.
- Added axe, screenshot, Lighthouse, IDOR, bundle and log leak checks.

## Stage 8: marketing site
- Plan comparison, FAQ, longer "what we will not do", trust page, founder note. Waitlist stored in Postgres.

## Stage 7: operations hygiene
- Sentry (server only) with scrubbing, structured logs with a value allowlist, Postgres rate limits, security headers and nonce CSP.
- Inngest jobs: SLA and hour budget alerts, no reply check, renewal and bill reminders, approved action step, housekeeping.
- Data export (JSON and ZIP), family deletion, withdrawal of parent consent, including STOP on WhatsApp.

## Stage 6: subscription billing
- Stripe Checkout, customer portal and signed webhook. Test keys only.

## Stage 5: family dashboard
- Undo enforced in the database, claims checklist and progress, calendar by month, printable report.
- Consent per purpose for owner and parent, confirmed by a coordinator call, with an audit trail and a pause for counsel.
- `PaymentPartner` stub. Coordinators can raise approvals.

## Stage 4: WhatsApp
- Webhook stores messages idempotently, matches parents, attaches media to the vault, runs emergency detection.
- Drafts pass the extended advice filter and need a human click. 24 hour window and templates. Sending is off by flag.
- Voice notes stored, Sarvam adapter and mock.

## Stage 3: document vault
- Private storage, signed links, size and type limits by file content, scan hook, consent per document.
- Claude extractor with field confidence. Under 0.9 forces a coordinator check.

## Stage 2: ops console
- Queue filters, timer that survives refresh, manual time, notes, templates, one-click escalation.
- Hours per family with margin, budget and SLA flags, weekly trend, CSV.

## Stage 1: persistence and auth
- Replaced the in-memory store with Postgres under RLS. Same export names, now async.
- Migration 002 fixes RLS recursion and over-broad write policies in 001.
- Supabase Auth: magic link for owners, email and password for staff. Mocked demo login removed. Demo family only seeded when DEMO_MODE=1.
- Added local stack, seed script, staff creation script.
