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

## PRD versus verdict
- Verdict wins: build what makes the concierge fast and measures hours. Partner logins, fraud freeze automation and multi-parent screens are left out.
- PRD says hour target 4 at $79. `lib/rules.ts` uses the kill line of 6 hours as the budget. Rules are the source of truth, so the budget stays 6.
- The `partner` role exists in the schema but has no access to anything. Partners get a briefed message by WhatsApp or email.
