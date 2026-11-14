# Changelog

## Voice note requests, time pricing, tidy privacy, smarter assistant
- Voice note requests: on New request, a customer can just record a voice note. The screen lists what to cover (what, where with PIN code, who we meet, when, how soon, how long, what we carry, anything special), shows a timer and an example, and lets them listen back before sending. The request is created from the note alone; the desk listens, fills in the details with the customer, and prices it. The note is kept for a person and is not sent to AI.
- Time pricing: the customer is charged for time, in half-hour blocks at $7 (travel, handover at each stop, the work itself, waiting), and every quotation shows rupees and dollars. Travel time comes from distance and speed; the customer says how long the work will take. The rider and vehicle costs are worked out underneath, and a fair price check keeps the price from falling below our costs plus the 25% fee. The old cost-plus way is one setting away.
- Privacy page rebuilt: consent as one card per person, a short activity log in plain words grouped by day with filters, repeats merged, and the delete option tucked behind one click.
- Ally Assistant knows the product: it answers how to do things and where things are, with buttons that go straight there, says no kindly to other cities and things we do not do, offers WhatsApp (and email when one is set), and never guesses.
- The menu now draws folded on the first paint, so it no longer covers the page after a reload.
- Migration 016. Additive only.

## Mumbai pricing, 100% advance, smoother motion
- Pricing calculator for the desk (Ops, Settings, Pricing, and inside each request). It shows the whole breakdown: what goes to the rider, what the electric vehicle costs us, provider costs at cost, Ally's 25% fee, taxes, rounding, and the total the customer pays in advance. The customer sees the quotation, never how it was built.
- Customers now say where and when: how soon, pickup and drop addresses with PIN codes and a contact at each, a time window, and what is carried (size, weight, value). They can add missing details later from the request. The desk can ask for everything that is missing in one message.
- Mumbai only: a PIN code outside Greater Mumbai is flagged to the customer and blocks pricing.
- Rate card with versions: an admin changes any rate, with a reason, and every change is a new version. A saved price keeps the card it used.
- Multi-currency display: rates for USD, GBP, EUR, CAD, AUD, SGD and AED, fetched on request or entered by hand, with the source and date shown. The price itself stays in rupees.
- 100% advance: quotations say they are paid in full before the work starts, and the desk cannot move a request to Assigned or In progress until a payment is confirmed with proof.
- Smoother app: the menu opens and closes with a squeezed panel instead of a jump, labels fade in one after another, panels and list rows arrive softly, buttons spring back, and the page scrolls smoothly. Only transform and opacity ever move.
- Migration 015. Additive only.

## WhatsApp inbound pipeline
- New webhook at `/api/whatsapp/webhook`. Signature checked on the raw body, every message stored once, answered at once, read in the background.
- Knows who wrote: owner, parent, family member, WhatsApp-only contact, or unknown. Unknown numbers learn nothing about any family and reach a person.
- Consent first on WhatsApp, per purpose. STOP in English, Hindi, Gujarati and Marathi stops everything and is recorded.
- Emergency words in four languages go straight to the top of the queue, with "call 112".
- AI reads texts into one of the eight service areas, with a confidence per field. Under 90% a person checks. If the model is down, a person reads it.
- Messages join an open request or start a new one. Lite's monthly limit is respected.
- Photos and PDFs go to the vault. Voice notes are kept for a person and never sent to AI. Other file types are refused politely.
- WhatsApp sending stays off (`WHATSAPP_SENDING=0`). Replies wait in an ops outbox as "would send", ready to copy.
- Ops WhatsApp inbox, conversation view, outbox, and WhatsApp numbers on Reports. "via WhatsApp" on the queue and on the owner's request page.
- Owners can link their WhatsApp number with a code, then approve or undo a quotation by reply.
- Local WhatsApp emulator and fixtures. Migration 014. Additive only.

## Ally 2.0, rebuild and speed
- Speed: the app ran in Washington (iad1) while the database sits in Singapore. Every page made 9 to 23 database trips across the world. The app now runs in Singapore (vercel.json, sin1), repeated reads in one page load are shared, and pages stream in parts.
- Every page has its own loading shape, appears after a short pause, and offers "Try again" if it takes too long. Errors show a plain message and a retry.
- Sign-up no longer sticks on "Setting up". Consents save in one step, a second press returns the same account, real errors show, and answers are kept.
- Customer menu is five places: Home, Requests, Documents, Family & Details, Settings, plus New request. Ops menu is Overview, Requests, Families, Task Queue, Settings.
- Home: "Here's what's happening back home.", four counts, needs your attention, activity, upcoming dates, local time, coordinator.
- Family & Details page: contacts, addresses, bills and dates, preferences, consent.
- Payments: a record per payment, pending, confirmed or failed. Confirmed needs a reference or a receipt. Links must be https and come from the provider. No wallet, nothing moves money.
- Documents: download, rename and link to a request.
- Plus no longer promises visits. Visits are quoted first.
- Small confirmation messages after saving. Lighter glass header and soft background.
- Migration 013. Additive only.

## Ally 2.0, complete overhaul
- New light design system, shared by the website, the customer app and Ops. New sidebar, phone drawer and bottom bar.
- Website rebuilt around "Your life is abroad. Your responsibilities don't have to be." Eight service areas, a four-step demonstration and a sample dashboard.
- Command Centre: needs your attention (by urgency), calendar, recent activity, quick actions and your coordinator.
- Bills & Renewals: amounts, repeats, reminder choices, calendar and list views. Handled never means paid.
- Document Vault: expiry dates, tags, versions, image previews, related requests, property links, an access log per document, and asking your documents.
- Properties get their own page, with tenant, rent, bills, visits, requests and documents.
- Family roles: administrator, member, read-only viewer and temporary contact with an end date.
- Requests: property link, needed-by date, voice notes, a two-panel detail page. Approvals: reject, request a revised quote, ask a question, decision deadline.
- Ally Assistant answers from the person's own records with sources, and refuses to pay, sign, file, approve or advise. An optional AI step sends titles and dates only, with consent, behind ASSISTANT_AI.
- Reports: month, category and property filters, and a downloadable PDF.
- Ops: Overview, Families, Requests, Task Queue with saved views, Coordinators, Service Partners, Properties, Document Review, Approvals, Visits with inspection reports, Reports and Settings.
- Service partners earn each status in order, with who checked and when. Only approved partners can be assigned.
- Plans live in the database and are enforced: Lite stops at 3 new requests a month, and visits need the plan or an approved quotation. "No visit caps" is gone.
- Request categories are now the same eight the website shows.
- Fixed: plain dates such as "expected by" came back in the wrong format.
- Migration 012. Additive only.

## Ally 2.0, Phase 1
- New website, map hero, service catalogue, six-stage workflow and a working sample of the dashboard.
- Six-step onboarding after Google sign-in. Dashboards start empty.
- Command Centre with a briefing built only from the customer's own records.
- Requests with references, statuses, a timeline, quotations, approve, reject and request changes, proof and a final report.
- Requests are refused when unlawful, and flagged when they need a licensed professional.
- Document Vault with categories, search, drag and drop, camera, progress, expiry dates and per-document sharing.
- Family members with permissions, one-use invitations and WhatsApp-only contacts.
- Properties and assets. Coordinator request console.
- Migration 011. Additive only.

## Anything done back home
- The site now speaks to anyone earning abroad who needs something done in India, not only people with parents to look after.
- Sign-up starts from the request. A customer can ask for their own work, with no parent and no consent call. Migration 010.
- Each request becomes a task for the desk. Requests that ask for advice are flagged for a licensed professional.

## Security and motion pass
- Session cookies are now HttpOnly, Secure and SameSite=Lax.
- Sign-in limits per mailbox and per account, as well as per address. Google and link sign-in are limited too.
- Failed sign-ins go to the audit log and logs without the email address. Repeats raise an admin alert (migration 009).
- HTTP redirects to HTTPS, cross-site API calls are refused centrally, more security headers, job endpoint shut without its key.
- Closed a redirect trick using tabs and newlines. Tightened form limits. Demo features need the local emulator.
- Packages: 0 known holes. Removed two unused packages.
- New look, logo and motion across the site. Pause motion button. Live India clock on the family page.

## Going live
- Every page now runs the full width of the screen, with colour bands and wider grids.
- Added `/demo`: a public, no-account walk-through with a fictional family. It runs in the browser only.
- Added Google sign-in behind `GOOGLE_SIGNIN`. New Google accounts start as owners.
- With no database settings, sign-in and the waitlist now say they are not open yet instead of failing.
- Added `/privacy`: a public draft privacy policy, linked from the footer and the trust page. It still needs a lawyer's review, a legal name and a contact address.

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
