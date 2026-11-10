-- Bills, visits, service partners, plans and richer records. Everything here adds to the schema. No table or column is removed.

-- ---------- Plans: what a customer pays for, and what the product then allows ----------
create table if not exists plans (
  slug text primary key,
  name text not null,
  price_usd numeric(6,2) not null,
  blurb text not null default '',
  features text[] not null default '{}',
  requests_per_month int check (requests_per_month is null or requests_per_month >= 0),
  includes_visits boolean not null default false,
  priority_response boolean not null default false,
  featured boolean not null default false,
  sort int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table plans enable row level security;
create policy plans_visible on plans for select using (active or public.is_admin());

insert into plans (slug, name, price_usd, blurb, features, requests_per_month, includes_visits, priority_response, featured, sort) values
  ('lite', 'Lite', 40, 'For a few things a month.', array['Document vault','Bills and renewal tracking','Monthly report','Up to 3 new requests a month','In-person visits are quoted before they happen'], 3, false, false, false, 1),
  ('family', 'Family', 79, 'A good place to start.', array['Everything in Lite','No monthly limit on new requests','Errands, property and paper chasing','Help with claims paperwork','Weekly updates from your coordinator','In-person visits are quoted before they happen'], null, false, false, true, 2),
  ('plus', 'Plus', 119, 'When you need someone on the ground.', array['Everything in Family','Priority in the coordinator queue','In-person visits arranged within your plan','Hospital desk support'], null, true, true, false, 3)
on conflict (slug) do nothing;

-- ---------- Profiles ----------
alter table profiles add column if not exists working_hours text;
alter table profiles add column if not exists ai_assistant_consent boolean not null default false;

-- ---------- Family members: roles, location and time-limited access ----------
alter table family_members add column if not exists role text not null default 'member' check (role in ('family_admin','member','viewer','temporary'));
alter table family_members add column if not exists location text;
alter table family_members add column if not exists access_expires_at timestamptz;

create or replace function public.is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = auth.uid() and m.status = 'active' and (m.access_expires_at is null or m.access_expires_at > now()));
$$;

create or replace function public.member_can(fid uuid, perm text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = auth.uid() and m.status = 'active' and (m.access_expires_at is null or m.access_expires_at > now()) and perm = any(m.permissions));
$$;

create or replace function public.member_can_see_document(did uuid, fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.member_can(fid, 'view_documents') or exists (
    select 1 from public.document_shares s join public.family_members m on m.id = s.member_id
    where s.document_id = did and m.user_id = auth.uid() and m.status = 'active' and (m.access_expires_at is null or m.access_expires_at > now())
  );
$$;

-- ---------- Properties ----------
alter table properties add column if not exists ownership text;
alter table properties add column if not exists rent_inr bigint check (rent_inr is null or rent_inr >= 0);
alter table properties add column if not exists tenant_phone text;
alter table properties add column if not exists lease_end date;
alter table properties add column if not exists contact_member_ids uuid[] not null default '{}';

-- ---------- Document vault ----------
alter table documents add column if not exists expires_on date;
alter table documents add column if not exists issued_on date;
alter table documents add column if not exists expiry_confirmed boolean not null default false;
alter table documents add column if not exists property_id uuid references properties(id) on delete set null;
alter table documents add column if not exists version int not null default 1;
alter table documents add column if not exists supersedes uuid references documents(id) on delete set null;
create index if not exists documents_supersedes_idx on documents (supersedes);

-- ---------- Bills, renewals and important dates ----------
create table if not exists deadlines (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('electricity','water','society','property_tax','rent_agreement','insurance','vehicle_insurance','appointment','other')),
  amount_inr bigint check (amount_inr is null or amount_inr >= 0),
  due_on date not null,
  property_id uuid references properties(id) on delete set null,
  person text,
  recurrence text not null default 'none' check (recurrence in ('none','monthly','quarterly','half_yearly','yearly')),
  document_id uuid references documents(id) on delete set null,
  status text not null default 'upcoming' check (status in ('upcoming','handled','cancelled')),
  handled_at timestamptz,
  reminder_days int[] not null default '{30,15,7,0}',
  reminder_on date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists deadlines_family_idx on deadlines (family_id, due_on);
alter table deadlines enable row level security;
create policy deadlines_visible on deadlines for select using (public.can_see_family(family_id) or public.member_can(family_id, 'view_bills'));

-- ---------- Service partners. Visible to staff only ----------
create table if not exists service_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  city text,
  phone text,
  email text,
  status text not null default 'not_reviewed' check (status in ('not_reviewed','identity_checked','references_checked','approved','suspended')),
  availability text,
  notes text,
  identity_checked_at timestamptz,
  identity_checked_by uuid references profiles(id),
  references_checked_at timestamptz,
  references_checked_by uuid references profiles(id),
  approved_at timestamptz,
  approved_by uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table service_partners enable row level security;
create policy service_partners_staff on service_partners for select using (public.is_staff());

create table if not exists partner_feedback (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references service_partners(id) on delete cascade,
  request_id uuid references service_requests(id) on delete set null,
  body text not null,
  author_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table partner_feedback enable row level security;
create policy partner_feedback_staff on partner_feedback for select using (public.is_staff());

-- ---------- Requests and quotations ----------
alter table service_requests add column if not exists partner_id uuid references service_partners(id) on delete set null;
alter table service_requests add column if not exists property_id uuid references properties(id) on delete set null;
alter table service_requests add column if not exists member_id uuid references family_members(id) on delete set null;
alter table service_requests add column if not exists due_on date;
alter table service_requests add column if not exists escalated_at timestamptz;
alter table quotations add column if not exists approval_deadline date;
alter table quotations add column if not exists document_id uuid references documents(id) on delete set null;

-- ---------- Visits and inspection reports ----------
create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  property_id uuid references properties(id) on delete set null,
  request_id uuid references service_requests(id) on delete set null,
  coordinator_id uuid references profiles(id),
  purpose text not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  completed_at timestamptz,
  notes text,
  issues text,
  next_steps text,
  photo_document_ids uuid[] not null default '{}',
  follow_up_request_id uuid references service_requests(id) on delete set null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists visits_family_idx on visits (family_id, scheduled_at desc);
alter table visits enable row level security;
create policy visits_visible on visits for select using (public.can_read_requests(family_id));

-- ---------- Saved views in the task queue. Each person sees only their own ----------
create table if not exists saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  query text not null,
  created_at timestamptz not null default now()
);
alter table saved_filters enable row level security;
create policy saved_filters_own on saved_filters for select using (user_id = auth.uid());
