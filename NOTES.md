# Notes and assumptions

## Verification environment
- This machine has no Docker, Supabase CLI or psql, and no Supabase, Stripe, WhatsApp, Sentry or model API credentials were provided for this project.
- Database tests run on real Postgres 17 from the `embedded-postgres` npm package. RLS is exercised for real.
- `supabase/local/000_supabase_shim.sql` recreates the `auth` schema and roles. It is never applied to a real project.
- `scripts/local/supabase-emulator.mjs` stands in for the Supabase Auth and Storage REST APIs, so the real `supabase-js` code runs in tests. It is not Supabase, and passing against it does not prove behaviour on a real project.
- Playwright uses the installed Chrome (`channel: "chrome"`) because the browser download timed out on this network.

## Decisions
- Data access uses direct Postgres (`pg`) with `set local role authenticated` plus JWT claims per transaction, instead of PostgREST. RLS applies exactly as it would through PostgREST, and the same SQL is testable without Docker. Supabase is still the host for Postgres, Auth and Storage. Needs `DATABASE_URL`.
- `lib/store.ts` keeps its export names, but every function is now async, because a database cannot answer synchronously. Screens gained `await` and nothing else changed for that reason.
- Family, task and document ids are UUIDs, so demo URLs are `/family/f0000000-...` rather than `/family/shah`.
- One parent per family on screen, although the schema allows several. The concierge does not need more yet.
- Web uploads are capped at 4 MB because Vercel functions reject larger bodies at about 4.5 MB. Larger files can arrive through WhatsApp.

## Migration 001 defects (found by running it)
- `can_see_family()` read `families` under RLS and recursed: any owner query failed with "stack depth limit exceeded". Fixed with SECURITY DEFINER helpers in 002.
- Owners could update tasks, log time and edit any column of an approval. Fixed in 002: decisions go only through `decide_approval` and `undo_approval`.

## Other decisions
- Extraction uses `claude-opus-5-5` with structured output and server-side refusal fallback (`fallbacks: "default"`). A refusal or a failed read becomes a human task. Documents leave India for this, which is a DPDP question for the lawyer. Change the model with `EXTRACTOR_MODEL`.
- Sentry is server only. Browser-side tracking would add JS and another path for personal data.
- Rate limits live in Postgres so no extra vendor is needed.
- Parents are matched by normalised phone number, unique across the system. A parent cannot be on two families yet.
- CSP: signed-in pages use a per-request nonce with `strict-dynamic`. Static marketing pages allow inline scripts because they hold no user data and a nonce would force them dynamic.
- Lint has its own install in `tools/lint` because typescript-eslint does not support TypeScript 7 yet.
- The ops pages stream a loading skeleton, so a forbidden task page answers 200 with a not-found body. No task data is sent. Family pages answer 404.

## Known limits
- With WhatsApp sending off, an emergency appears at the top of the queue and on the timeline only. Nobody is pushed a notification, so a person has to be watching. The PRD's "NRI notified in minutes" needs sending turned on and an owner phone number.
- Web uploads stop at 4 MB.
- `/demo` is a scripted simulation in the browser. "Real time" there means it plays out as you watch. Signed-in pages still update on navigation or refresh, not by push.
- Full width is deliberate at the owner's request. On very wide screens single-column forms get long.
- Bill due dates reach the calendar only when printed as a clear date the extractor can return as YYYY-MM-DD.

## PRD versus verdict
- Verdict wins: build what makes the concierge fast and measures hours. Partner logins, fraud freeze automation and multi-parent screens are left out.
- PRD says hour target 4 at $79. `lib/rules.ts` uses the kill line of 6 hours as the budget. Rules are the source of truth, so the budget stays 6.
- The `partner` role exists in the schema but has no access to anything. Partners get a briefed message by WhatsApp or email.

## Ally 2.0 overhaul
- `/ops` is now the Overview. The task queue moved to `/ops/queue` and old `/ops?...` filter links redirect there. Hours per family moved to `/ops/reports`. `/family/[id]/calendar` redirects to Bills & Renewals.
- Business decision taken in code, to confirm: Lite and Family get visits only on an approved quotation, Plus includes them. Editable in Ops Settings.
- The assistant runs on fixed rules. The optional Claude step needs `ANTHROPIC_API_KEY`, `ASSISTANT_AI=1` and the person's own opt-in, and has only been tested with a fake client.
- PDF previews open in a new tab because `frame-ancestors 'none'` blocks embedding. Images preview on the page through the same audited route.
- `Permissions-Policy` now allows the microphone on our own origin, for voice notes. Voice notes are stored for a person and never sent to AI.
- Reminders appear in the app only. Email and WhatsApp reminders are not connected.
- PDF reports use the built-in Helvetica font, so non-Latin text prints as a question mark.

## Rebuild and speed (phase 3)
- Cause of slow pages, measured not guessed: Vercel ran the app in iad1, the database is in ap-southeast-1. One round trip is about 265 ms, one transaction about 3 round trips, and the pool holds one connection, so trips queue. Home made 23 transactions (71 round trips).
- Fix: run in sin1, share reads within one request (React cache), stream sections with Suspense, batch the consent insert.
- Measured locally with 265 ms added per round trip and one connection (DB_SIMULATED_LATENCY_MS, PG_POOL_MAX=1). Before then after: Home 19.8 s to 14.9 s full content (5.9 s first view), 71 to 53 round trips. Documents 13.1 s to 12.5 s. Onboarding 25 s to 19.1 s. At Singapore distance (2 ms) the same pages take 0.4 to 1.2 s. The region move is the main fix and only applies after deploy.
- Lighthouse mobile, local: every key page 100, LCP under 1 s, CLS 0.
- Payments: Cashfree first, PayU as the alternative. Neither is applied for or assumed eligible. Today staff paste the provider's own payment link and record proof. A provider integration plugs in behind the PaymentPartner stub later.
- Not verified: live Google sign-in with real accounts, live speed after the region move, the design reference image (never received).

## WhatsApp inbound pipeline (migration 014)

### What it does
- Webhook `/api/whatsapp/webhook`. GET answers Meta's subscribe check with `WHATSAPP_VERIFY_TOKEN` (constant-time compare). POST checks `X-Hub-Signature-256` over the raw body with `WHATSAPP_APP_SECRET` in constant time. Missing or wrong signature: 401, logged with the reason and body size only.
- Each message is stored once in `whatsapp_messages` (the wamid is unique), then the webhook answers 200. Reading happens in the Inngest function `whatsapp-message` when `INNGEST_EVENT_KEY` is set, otherwise right after the response. A sweep job every 2 minutes picks up anything left behind. If anything fails, the message becomes "needs a person" with a task. No message is dropped.
- Delivery receipts (sent, delivered, read, failed) go to `whatsapp_status_events` once, and only move a message forward.
- Limits: 20 a minute per number (kept, but not read automatically past that) and 600 a minute overall (503, so Meta delivers again later). Both use the existing Postgres limiter, keyed by a hash, never the number.
- Numbers are stored as a keyed hash (for matching), encrypted (for replying), and the last four digits. Logs hold ids and counts only.
- Sender: an owner who linked the number with a code, a parent, a family member or WhatsApp-only contact, an owner whose profile has the number, else unknown. Unknown: no family data is created or looked up, the reply asks for the account holder's name, an alert and a "needs a person" inbox item open. The reply never names a family.
- Order for every message: STOP, link code, emergency words, unknown sender, HUMAN, quote decision, consent, unsupported media, then reading.
- Emergency words (English, Hindi, Gujarati, Marathi, in script and Roman letters) run first and need no AI. They make an `EMERGENCY:` task with a 10 minute SLA, which the queue already puts at the top, and reply "call 112". Test set: `tests/fixtures/emergency-messages.ts`, 26 per language plus ordinary messages that must not trigger.
- Reading: the same approach as document reading. Structured output, a confidence per field, server-side fallback on refusal, model from `WHATSAPP_CATEGORISER_MODEL` or `EXTRACTOR_MODEL`. Facts are encrypted with the family key. Model name and prompt version are stored with every reading. In code: any field under 90% means a check task; the request engine's refusal and advice rules run on the text; with no reading (no AI consent, model down, refusal) it becomes a plain task for a person.
- A follow-up joins an open request when it replies in the thread, or comes from the same number in the same area within 72 hours. Otherwise a new request, with any media attached as documents. Lite's limit: the message waits as "waiting for plan", the desk gets a task, the owner sees it in their activity and, with a linked number, gets the `ally_plan_limit` template.
- Media: images (JPEG, PNG, WebP), PDF and audio only, under 16 MB. Meta's stated size is checked before downloading. Photos and PDFs go through the existing vault pipeline (scan, private bucket, encrypted extraction, audited 60 second links). Voice notes are stored for a person and never sent to AI. Every listen is audited.
- Replies: one place can send, `lib/wa-outbox.ts`. With `WHATSAPP_SENDING=0` (the default) every reply is "would send" in the ops outbox, with a Copy button and a banner. With it on: free text only within 24 hours of their last message, approved templates otherwise, nothing after STOP except the one confirmation, and nothing that reads like advice.
- Quote approvals by WhatsApp: `APPROVE ALY-1234`, `DECLINE ALY-1234`, `UNDO ALY-1234`, only from an owner number linked with a one-time code (`LINK 123456`, made on the owner's Settings page, 15 minutes, single use). It calls the same `decide_approval` and `undo_approval` as the app, as the owner, so the 5 minute undo applies. The AI never sees or makes these decisions.
- Ops: WhatsApp inbox (`/ops/whatsapp`), a conversation view with the AI reading beside each message and its media, the outbox, and four numbers on Reports. The queue and the owner's request page say "via WhatsApp".

### Decisions taken in code, to confirm
- A new table, not the old `messages` table. The old `/api/whatsapp` route and `/ops/messages/[id]` stay as they were, so their tests still pass. Point Meta only at `/api/whatsapp/webhook`. Retiring the old route is a follow-up.
- WhatsApp consent has two purposes: `handle` (a person reads and keeps it) and `ai_read` (an AI service outside India reads the text first). YES gives both, PERSON ONLY gives the first. Parents are different: their consent still comes only from the coordinator's call. A parent writing without consent gets "your coordinator will call" and the desk gets a consent call task.
- Emergency words are acted on even without consent, and even after STOP, as a vital interest. Lawyer question below.
- STOP from a parent also withdraws their consent and pauses the family, as the old route did. STOP from anyone else stops WhatsApp messages and work on their messages, and tells the desk. It does not close the owner's account.
- Voice transcription is off unless the family's `whatsapp_transcribe` flag is on (default off, no screen sets it yet). Even then transcripts are only checked for emergency words, not sent to AI.
- NATIVE SPEAKER REVIEW NEEDED: STOP words (`lib/wa-keywords.ts`), every reply text (`lib/wa-templates.ts`) and the emergency list (`lib/wa-emergency.ts`) in Hindi, Gujarati and Marathi. None were written by a native speaker.

### WhatsApp setup
1. Meta app: at developers.facebook.com create a Business app, add the WhatsApp product, and connect it to the Meta Business portfolio that will own the number. Start business verification in Business Settings, Security Centre.
2. Phone number: add a number not in use on the WhatsApp app (or remove it from the app first), verify it by SMS or call, and set the display name (Meta reviews it). Note the Phone number ID shown in WhatsApp Manager.
3. Permanent token: in Business Settings create a System User (admin), give it the app and the WhatsApp account, and generate a token that never expires with `whatsapp_business_messaging` and `whatsapp_business_management`. That is `WHATSAPP_ACCESS_TOKEN`. App settings, Basic, App secret is `WHATSAPP_APP_SECRET`.
4. Webhook: URL `https://YOUR-DOMAIN/api/whatsapp/webhook`, verify token = `WHATSAPP_VERIFY_TOKEN`. Subscribe to the `messages` field. Set the four variables in Vercel, keep `WHATSAPP_SENDING=0`, redeploy, then press Verify in Meta.
5. Templates: submit each entry in `docs/whatsapp-templates.md` (Utility, one per language, same name). After any change to `lib/wa-templates.ts`, run `node scripts/whatsapp-templates-doc.mjs`.
6. Verification before sending: from a test phone send a text, a photo, a PDF, a voice note and STOP. Check each appears in `/ops/whatsapp` with the right sender, replies wait in the outbox, and Vercel logs show ids only. Then set `WHATSAPP_SENDING=1` and check one reply arrives. Go-live checks fail if the flag is 1 and any of the four settings is empty.

### Local emulator
`scripts/local/whatsapp-emulator.mjs` signs bodies the way Meta does and posts them to the local webhook. Fixtures in `scripts/local/whatsapp-fixtures.mjs`: bill photo, a text in each language, voice note, emergency, unknown number, repeated delivery, STOP, video, a delivery receipt. Run `node scripts/local/whatsapp-emulator.mjs list`. It is not Meta.

### Not verified without real Meta credentials
- Anything from Meta's own servers: real signatures, real payload variations (forwards, edits, reactions), media links and their expiry, whether `file_size` is always present, error codes, template approval, and the 24 hour window as Meta counts it.
- Real reading accuracy. Tests use a fake model that matches keywords.
- Inngest delivery of the `whatsapp/message.received` event. Locally the work runs after the response instead.

### Meta pricing
Source: developers.facebook.com/docs/whatsapp/pricing, read 2026-11-11 with an automated page reader. The page shows no "last updated" date. Check it again before relying on this.
- Since 1 July 2025 Meta charges per delivered message, not per conversation. Messages from people to the business are free.
- Template categories: marketing, utility, authentication. Service messages are free text inside the 24 hour window.
- Service messages were free from 1 November 2024. From 1 October 2026 they are charged after a free tier of 1,000 per business phone number per month.
- Utility templates inside an open window were free from 1 July 2025 and are charged from 1 October 2026.
- India rates were updated on 1 April 2026. The page links a rate card (CSV, PDF) but shows no India prices, so none are written here.
- Billing in INR started 1 January 2026 for eligible accounts. The page says accounts must move to INR by 31 December 2026.
- For Ally: every desk reply, even inside 24 hours, can now cost money beyond 1,000 a month per number. This needs a line in the unit economics model.

### DPDP: what the code does, and what is open
- Consent per purpose: stored per number and purpose (`handle`, `ai_read`) with wording version, language and the message that gave it. Nothing is read before it, except emergency words. Withdrawal is one word (STOP) in four languages, honoured at once and audited.
- Guardian consent: the code cannot tell if a sender is a child, or an adult who cannot consent. Parents with doubtful capacity already go through `pause_for_counsel`. A minor writing as a WhatsApp-only contact is not detected.
- 72 hour breach process: not automated. Needs a written runbook: who decides it is a breach, who tells the Data Protection Board and each person affected, and the notice text. The audit log holds ids, so affected families can be listed.
- Retention: no automatic deletion of WhatsApp messages yet. Deleting a family deletes its messages. Unknown-number messages stay until a retention job exists. A period must be decided.
- Documents and texts leave India for AI reading (Anthropic). Voice notes do not. The consent message says so.

### Questions for the lawyer
1. Is one YES enough for two purposes listed in one message, or must each purpose get its own reply?
2. May we act on emergency words from someone who has not consented, or who sent STOP? May we reply "call 112"?
3. When a relative or contact writes about the parent, whose data is it, and whose consent covers it?
4. Is the `consent_prompt` wording in `lib/wa-templates.ts` valid under the DPDP Rules, including AI reading outside India?
5. Guardian consent: what must we do if a sender may be a minor, or lack capacity?
6. Retention: how long may we keep messages from unknown numbers, and messages after a family leaves?
7. Is an APPROVE reply from a number proved by a one-time code a valid approval of a quotation, with the 5 minute undo?
8. Breach: confirm the 72 hour duty and what the notice to the Board and to each person must say.
9. Does Meta processing messages through the Cloud API need its own line in the privacy policy and consent?
