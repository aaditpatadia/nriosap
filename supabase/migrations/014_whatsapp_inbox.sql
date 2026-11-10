-- WhatsApp inbound pipeline: every message, its AI reading, its desk review, and replies that may not be sent yet.
-- Additive only. No table or column is removed. The older `messages` table and /api/whatsapp route stay as they are.

-- ---------- Every WhatsApp message in or out, including ones from unknown numbers ----------
create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  sender_contact_id uuid references family_members(id) on delete set null,
  parent_id uuid references parents(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,
  sender_kind text not null default 'unknown' check (sender_kind in ('owner','parent','member','contact','unknown','desk')),
  -- Keyed hash of the number, so conversations group without storing it in plain text.
  phone_hash text not null,
  -- The number itself, encrypted, so the desk can reply. Last four digits for display only.
  phone_enc text,
  phone_tail text,
  direction text not null check (direction in ('in','out')),
  wamid text unique,
  reply_to_wamid text,
  type text not null default 'text' check (type in ('text','image','document','audio','template','other')),
  text text,
  media_id text,
  media_mime text,
  media_bytes int,
  media_path text,
  media_filename text,
  transcript text,
  document_id uuid references documents(id) on delete set null,
  language text,
  received_at timestamptz not null default now(),
  category text,
  confidence numeric(3,2),
  title text,
  urgency text check (urgency in ('low','normal','high')),
  needs_professional boolean not null default false,
  facts_enc text,
  field_confidence jsonb not null default '{}',
  ai_status text not null default 'not_run' check (ai_status in ('not_run','done','refused','failed','skipped_consent','skipped_voice','skipped_rules')),
  model_name text,
  prompt_version text,
  status text not null default 'received' check (status in (
    'received','processing','held_consent','rate_limited','needs_human','routed','waiting_plan','confirmed','spam','rejected','stopped','command',
    'would_send','queued','sent','delivered','read','failed','blocked')),
  request_id uuid references service_requests(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  template_name text,
  template_vars jsonb,
  error_code int,
  category_confirmed_by uuid references profiles(id),
  category_corrected boolean,
  first_human_at timestamptz,
  drafted_by uuid references profiles(id),
  copied_at timestamptz,
  processing_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_messages_phone_idx on whatsapp_messages (phone_hash, received_at desc);
create index if not exists whatsapp_messages_family_idx on whatsapp_messages (family_id, received_at desc);
create index if not exists whatsapp_messages_status_idx on whatsapp_messages (status, received_at);
create index if not exists whatsapp_messages_request_idx on whatsapp_messages (request_id);
alter table whatsapp_messages enable row level security;

-- Same pattern as the family tables. Messages from unknown numbers have no family, so only the desk can see them.
-- Rows are written by the server after its own checks, so user sessions get no insert, update or delete rights.
create policy whatsapp_messages_visible on whatsapp_messages for select
  using ((family_id is not null and public.can_see_family(family_id)) or (family_id is null and public.is_staff()));

-- ---------- Delivery receipts from Meta. Stored once per message and status ----------
create table if not exists whatsapp_status_events (
  id uuid primary key default gen_random_uuid(),
  wamid text not null,
  status text not null check (status in ('sent','delivered','read','failed')),
  error_code int,
  at timestamptz not null default now(),
  unique (wamid, status)
);
alter table whatsapp_status_events enable row level security;
create policy whatsapp_status_staff on whatsapp_status_events for select using (public.is_staff());

-- ---------- WhatsApp consent per number and purpose, for people with no consent record elsewhere ----------
create table if not exists whatsapp_consents (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null,
  family_id uuid references families(id) on delete cascade,
  purpose text not null check (purpose in ('handle','ai_read')),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  method text not null default 'whatsapp_reply' check (method in ('whatsapp_reply')),
  wording_version text not null,
  language text,
  evidence_wamid text,
  created_at timestamptz not null default now(),
  unique (phone_hash, purpose)
);
alter table whatsapp_consents enable row level security;
create policy whatsapp_consents_visible on whatsapp_consents for select
  using ((family_id is not null and public.can_see_family(family_id)) or (family_id is null and public.is_admin()));

-- ---------- STOP. One row per number. While stopped_at is set and restarted_at is not later, nothing is processed or sent ----------
create table if not exists whatsapp_optouts (
  phone_hash text primary key,
  stopped_at timestamptz not null default now(),
  stop_wamid text,
  restarted_at timestamptz,
  consent_prompted_at timestamptz
);
alter table whatsapp_optouts enable row level security;
create policy whatsapp_optouts_admin on whatsapp_optouts for select using (public.is_admin());

-- ---------- Linking an owner's WhatsApp number. A code shown in the app, sent from the phone, proves the number ----------
alter table profiles add column if not exists whatsapp_hash text;
alter table profiles add column if not exists whatsapp_verified_at timestamptz;
alter table profiles add column if not exists whatsapp_phone_enc text;
create unique index if not exists profiles_whatsapp_hash_unique on profiles (whatsapp_hash) where whatsapp_hash is not null;

create table if not exists whatsapp_link_codes (
  code_hash text primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table whatsapp_link_codes enable row level security;
-- No policies: only the server reads or writes these.

-- ---------- Voice note transcription is off unless the family opts in ----------
alter table families add column if not exists whatsapp_transcribe boolean not null default false;

-- ---------- Where a desk task came from, so the queue can say "via WhatsApp" ----------
alter table tasks add column if not exists source text;

-- ---------- Alerts for messages from unknown numbers ----------
alter table alerts drop constraint if exists alerts_kind_check;
alter table alerts add constraint alerts_kind_check check (kind in ('sla','hours','no_reply','renewal','bill','security','whatsapp'));
