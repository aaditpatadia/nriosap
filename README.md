# Gharsaath MVP (working name)

The working tool for the 30 day concierge phase of an India desk for NRIs. Evidence and decisions: `../reports/India desk NRI research.md`. Product spec: `../specs/PRD.md`. Design tokens: `../specs/design-system.md`.

## Run it
```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 18 unit tests (rules, margin model, encryption, webhook signature)
npm run build && npm start
```
No environment variables are needed for the demo. `.env.example` lists the real ones.

## Screens
| Route | What it is |
|---|---|
| `/` | Marketing site: hero, how it works, pricing ($40 / $79 / $119), what we will not do, waitlist |
| `/onboarding` | Add parent, record two consents, documents step |
| `/family/shah` (also `kulkarni`, `mehta`) | Family dashboard: overview and timeline, claims, documents, calendar, approvals, monthly report, billing |
| `/chat/shah` | Simulated parent WhatsApp view. Type "ambulance" to trigger the emergency path |
| `/ops` | Coordinator queue with SLA flags |
| `/ops/task/t1` | Task detail with a timer and time log |
| `/ops/families` | Hours per family, margin, hour budget flags (the number that decides the business) |
| `/api/whatsapp` | WhatsApp Cloud API webhook (GET handshake, POST with HMAC signature check) |

## Real vs mocked
Real:
- Next.js 16, React 19, Tailwind 4, Motion, Radix dependency, Zod validation on every server action.
- Approval flow: optimistic UI, 5 minute undo, persisted state, events written to the timeline.
- Rules in `lib/rules.ts`: approval policy table, advice filter, multilingual emergency detection, SLA and hour budget checks, margin model copied from the research spreadsheet.
- AES-256-GCM field encryption with a per family key (`lib/crypto.ts`), masked on screen.
- Audit log entries on document, policy and approval access.
- WhatsApp webhook: verification handshake, raw-body HMAC-SHA256 signature check with timing-safe compare, text message parsing.
- Postgres schema with row level security in `supabase/migrations/001_init.sql` (not applied to a live database).
- Motion tokens (`lib/motion.ts`, `app/globals.css`), reduced motion, large text mode, skeleton loaders, view transitions on the marketing site.

Mocked or missing:
- Data is an in-memory store seeded with three fictional families (`lib/store.ts`). It resets on restart. Swap it for a Supabase-backed module with the same exports.
- Sign-in is mocked. Anyone can open any family. Supabase Auth and the RLS policies are the intended replacement.
- Document extraction is `MockExtractor` behind the `DocumentExtractor` interface. No real model is called and no files are uploaded.
- No outbound WhatsApp sending. Business verification has not been done.
- Payments are display only. No money moves. A `PaymentPartner` interface is not built yet.
- Background jobs and Sentry are not wired in (listed in the PRD).
- The brand font is Figtree. Avantt needs a licence from Displaay; see `app/fonts.ts` (one file to change).
- Insurer, DigiLocker, ABDM and Account Aggregator integrations do not exist.

## Fonts
`app/fonts.ts` is the only place the font is chosen. To use Avantt after licensing: add the files to `app/fonts/`, change `src` and `variable` in that file.

## Verified in this build (9 Nov 2026, headless Chromium, Linux)
- Typecheck and production build pass. 18 of 18 unit tests pass.
- axe-core (WCAG 2.0, 2.1, 2.2 AA and best practices): 0 violations on 13 pages in light and dark at 390px.
- Lighthouse mobile (simulated throttling): performance 97 to 100, accessibility 100, best practices 100, SEO 100 on four pages. LCP 0.8 s, CLS 0.
- 78 screenshots at 375, 768 and 1440px, light and dark: no horizontal overflow, no console errors.
- Interaction flows pass: waitlist, approve, undo, persistence, emergency escalation to the ops queue, timer logging, large text, onboarding with consent, reduced motion, webhook accept and reject.

## Not verified
- Real mid-range Android device. Frame timing was measured in headless Chromium with 4x CPU throttle: 4 to 7% of frames over 33 ms during approve, undo and navigation, with a worst frame of 93 to 190 ms (route changes). Software rendering without a GPU makes this pessimistic, but it is not a phone test.
- Real WhatsApp traffic, real documents, real users, any live database.
- Screen readers (NVDA, VoiceOver, TalkBack). Only automated checks and keyboard-oriented markup.
- Hindi, Gujarati and Marathi text rendering on web beyond fallback fonts.
- Motion token values on a real phone. They are proposals.
- Legal questions in the PRD section 14. Nothing here is legal advice.
