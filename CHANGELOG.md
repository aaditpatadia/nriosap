# Changelog

## Stage 1: persistence and auth
- Replaced the in-memory store with Postgres under RLS. Same export names, now async.
- Migration 002 fixes RLS recursion and over-broad write policies in 001.
- Supabase Auth: magic link for owners, email and password for staff. Mocked demo login removed. Demo family only seeded when DEMO_MODE=1.
- Added local stack, seed script, staff creation script, 91 RLS tests and 9 sign-in end to end tests.
