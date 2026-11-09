-- Gharsaath initial schema. Postgres / Supabase. Row level security on every table.
-- Sensitive fields (policy numbers, IDs) are encrypted by the application before insert.

create extension if not exists pgcrypto;

create type user_role as enum ('owner', 'coordinator', 'admin', 'partner');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role user_role not null default 'owner',
  name text not null,
  phone text,
  country text,
  created_at timestamptz not null default now()
);

create table families (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  coordinator_id uuid references profiles(id),
  name text not null,
  plan_usd numeric(6,2) not null,
  status text not null default 'active',
  started_at timestamptz not null default now()
);

create table parents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  phone text not null,
  language text not null check (language in ('Hindi','Gujarati','Marathi','English')),
  city text,
  consent_status text not null default 'pending' check (consent_status in ('pending','granted','withdrawn'))
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents(id) on delete cascade,
  purpose text not null,           -- read_records | store | share_named_third_party | act_on_named_task
  scope text,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  evidence_ref text                -- whatsapp message id or signed form path
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  parent_id uuid references parents(id),
  kind text not null,
  storage_path text not null,
  extracted_enc text,              -- encrypted JSON
  confidence numeric(3,2),
  checked_by uuid references profiles(id),
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table policies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  insurer text not null,
  policy_no_enc text not null,
  sum_insured_inr bigint,
  renewal_date date,
  document_id uuid references documents(id)
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  policy_id uuid references policies(id),
  kind text not null check (kind in ('cashless','reimbursement')),
  status text not null,
  hospital text,
  amount_claimed_inr bigint,
  amount_settled_inr bigint,
  opened_at timestamptz not null default now(),
  sla_due_at timestamptz
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  kind text not null,
  title text not null,
  status text not null default 'todo',
  owner_id uuid references profiles(id),
  due_at timestamptz,
  sla_at timestamptz,
  hour_budget numeric(4,1) not null default 1,
  needs_approval boolean not null default false
);

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references profiles(id),
  minutes int not null check (minutes > 0 and minutes <= 600),
  note text,
  at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  task_id uuid references tasks(id),
  summary text not null,
  amount_inr bigint not null default 0,
  payee text,
  fees_inr bigint not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  undo_until timestamptz
);

create table events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  kind text not null,
  actor text not null check (actor in ('ai','human','system')),
  actor_name text,
  text text not null,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  body text,
  media_ref text,
  language text,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text not null,
  at timestamptz not null default now()
);

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  country text,
  note text,
  created_at timestamptz not null default now()
);

-- ---------- Row level security ----------
alter table profiles enable row level security;
alter table families enable row level security;
alter table parents enable row level security;
alter table consents enable row level security;
alter table documents enable row level security;
alter table policies enable row level security;
alter table claims enable row level security;
alter table tasks enable row level security;
alter table time_entries enable row level security;
alter table approvals enable row level security;
alter table events enable row level security;
alter table messages enable row level security;
alter table audit_log enable row level security;
alter table waitlist enable row level security;

create or replace function is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function can_see_family(fid uuid) returns boolean language sql stable as $$
  select is_admin() or exists (
    select 1 from families f where f.id = fid and (f.owner_id = auth.uid() or f.coordinator_id = auth.uid())
  );
$$;

create policy profiles_self on profiles for select using (id = auth.uid() or is_admin());
create policy families_visible on families for select using (can_see_family(id));
create policy parents_visible on parents for select using (can_see_family(family_id));
create policy consents_visible on consents for select using (exists (select 1 from parents p where p.id = parent_id and can_see_family(p.family_id)));
create policy documents_visible on documents for select using (can_see_family(family_id));
create policy policies_visible on policies for select using (can_see_family(family_id));
create policy claims_visible on claims for select using (can_see_family(family_id));
create policy tasks_visible on tasks for select using (can_see_family(family_id));
create policy time_visible on time_entries for select using (can_see_family(family_id));
create policy approvals_visible on approvals for select using (can_see_family(family_id));
create policy events_visible on events for select using (can_see_family(family_id));
create policy messages_visible on messages for select using (can_see_family(family_id));

-- Owners may decide their own approvals; coordinators write time, tasks, events.
create policy approvals_owner_update on approvals for update
  using (exists (select 1 from families f where f.id = family_id and f.owner_id = auth.uid()));
create policy time_coordinator_insert on time_entries for insert
  with check (user_id = auth.uid() and can_see_family(family_id));
create policy tasks_coordinator_update on tasks for update using (can_see_family(family_id));

-- Audit log and waitlist: writes happen only through the service role on the server.
create policy audit_admin_read on audit_log for select using (is_admin());
create policy waitlist_admin_read on waitlist for select using (is_admin());
