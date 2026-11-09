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
- Bill due dates reach the calendar only when printed as a clear date the extractor can return as YYYY-MM-DD.

## PRD versus verdict
- Verdict wins: build what makes the concierge fast and measures hours. Partner logins, fraud freeze automation and multi-parent screens are left out.
- PRD says hour target 4 at $79. `lib/rules.ts` uses the kill line of 6 hours as the budget. Rules are the source of truth, so the budget stays 6.
- The `partner` role exists in the schema but has no access to anything. Partners get a briefed message by WhatsApp or email.
