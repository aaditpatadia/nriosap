-- Phase 1 of the wider platform. Everything here adds to the schema. No table or column is removed.

-- ---------- Profiles and contact details ----------
alter table profiles add column if not exists india_cities text[] not null default '{}';
alter table profiles add column if not exists needs text[] not null default '{}';
alter table profiles add column if not exists preferred_language text;
alter table profiles add column if not exists preferred_channel text;
alter table profiles add column if not exists timezone text;
alter table profiles add column if not exists notify_updates boolean not null default true;
alter table profiles add column if not exists onboarded_at timestamptz;

-- Customers can start without giving a WhatsApp number.
alter table parents alter column phone drop not null;

-- ---------- Document vault ----------
alter table documents add column if not exists category text not null default 'other'
  check (category in ('identity','property','banking','insurance','family','legal','business','other'));
alter table documents add column if not exists tags text[] not null default '{}';

-- ---------- Family members ----------
create table if not exists family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  name text not null,
  relation text not null check (relation in ('parent','sibling','spouse','relative','representative')),
  permissions text[] not null default '{}',
  status text not null default 'contact' check (status in ('contact','invited','active','revoked')),
  invite_email text,
  invite_token_hash text unique,
  invite_expires_at timestamptz,
  phone text,
  language text,
  whatsapp_ok boolean not null default true,
  is_emergency boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists family_members_one_user on family_members (family_id, user_id) where user_id is not null;
create index if not exists family_members_user_idx on family_members (user_id);
alter table family_members enable row level security;

create or replace function public.is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = auth.uid() and m.status = 'active');
$$;

create or replace function public.member_can(fid uuid, perm text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = auth.uid() and m.status = 'active' and perm = any(m.permissions));
$$;

-- Members can see the owner and coordinator of their family, and those two can see the member.
create or replace function public.shares_family(pid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.families f
    where (f.owner_id = auth.uid() and f.coordinator_id = pid)
       or (f.coordinator_id = auth.uid() and f.owner_id = pid)
       or (public.is_family_member(f.id) and (f.owner_id = pid or f.coordinator_id = pid))
       or ((f.owner_id = auth.uid() or f.coordinator_id = auth.uid()) and exists (select 1 from public.family_members m where m.family_id = f.id and m.user_id = pid and m.status = 'active'))
  );
$$;

create policy family_members_visible on family_members for select
  using (public.can_see_family(family_id) or user_id = auth.uid());
create policy families_member_read on families for select using (public.is_family_member(id));
create policy parents_member_read on parents for select using (public.is_family_member(family_id));
create policy events_member_read on events for select using (public.member_can(family_id, 'view_activity'));

-- What a family member opens goes in the access log too.
create or replace function public.audit_event(p_action text, p_entity text, p_entity_id text, p_family_id uuid default null, p_ip text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_family_id is not null and not (public.can_see_family(p_family_id) or public.is_family_member(p_family_id)) then raise exception 'not allowed'; end if;
  insert into public.audit_log(actor_id, action, entity, entity_id, family_id, ip)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_family_id, p_ip);
end $$;
revoke execute on function public.audit_event(text, text, text, uuid, text) from public, anon;

-- ---------- Sharing one document ----------
create table if not exists document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (document_id, member_id)
);
alter table document_shares enable row level security;

create or replace function public.member_can_see_document(did uuid, fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.member_can(fid, 'view_documents') or exists (
    select 1 from public.document_shares s join public.family_members m on m.id = s.member_id
    where s.document_id = did and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create policy document_shares_visible on document_shares for select
  using (public.can_see_family(family_id) or exists (select 1 from public.family_members m where m.id = member_id and m.user_id = auth.uid()));
create policy documents_member_read on documents for select using (public.member_can_see_document(id, family_id));
create policy doc_consent_member_read on document_consents for select using (public.member_can_see_document(document_id, family_id));

-- ---------- Requests ----------
create sequence if not exists service_request_no start 1001;

create table if not exists service_requests (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default 'ALY-' || nextval('service_request_no'),
  family_id uuid not null references families(id) on delete cascade,
  created_by uuid references profiles(id),
  category text not null,
  title text not null,
  description text not null,
  location text,
  priority text not null default 'normal' check (priority in ('normal','urgent')),
  status text not null default 'submitted' check (status in ('submitted','under_review','awaiting_information','quotation_ready','awaiting_approval','approved','assigned','in_progress','awaiting_customer','completed','cancelled','disputed')),
  coordinator_id uuid references profiles(id),
  provider_name text,
  task_id uuid references tasks(id) on delete set null,
  understanding jsonb not null default '{}',
  needs_professional boolean not null default false,
  estimated_completion date,
  final_report text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_requests_family_idx on service_requests (family_id, created_at desc);
alter table service_requests enable row level security;

create table if not exists request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references service_requests(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  kind text not null check (kind in ('status','update','note','quote','evidence','assignment','message')),
  status text,
  body text not null,
  actor_id uuid references profiles(id),
  actor_name text not null default 'Desk',
  customer_visible boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists request_events_request_idx on request_events (request_id, created_at);
alter table request_events enable row level security;

create table if not exists request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references service_requests(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  kind text not null default 'customer' check (kind in ('customer','evidence')),
  caption text,
  created_at timestamptz not null default now(),
  unique (request_id, document_id)
);
alter table request_attachments enable row level security;

create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references service_requests(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  approval_id uuid unique references approvals(id) on delete set null,
  provider_name text,
  provider_fee_inr bigint not null default 0 check (provider_fee_inr >= 0),
  coordination_fee_inr bigint not null default 0 check (coordination_fee_inr >= 0),
  taxes_inr bigint not null default 0 check (taxes_inr >= 0),
  total_inr bigint not null check (total_inr >= 0),
  notes text,
  estimated_completion date,
  status text not null default 'sent' check (status in ('sent','approved','rejected','changes_requested','superseded')),
  change_note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists quotations_request_idx on quotations (request_id, created_at desc);
alter table quotations enable row level security;

create or replace function public.can_read_requests(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.can_see_family(fid) or public.member_can(fid, 'view_requests');
$$;

create policy service_requests_visible on service_requests for select using (public.can_read_requests(family_id));
create policy request_events_visible on request_events for select
  using (public.can_work_family(family_id) or (customer_visible and public.can_read_requests(family_id)));
create policy request_attachments_visible on request_attachments for select using (public.can_read_requests(family_id));
create policy quotations_visible on quotations for select using (public.can_read_requests(family_id));

-- One source of truth: a decision or an undo on the approval moves the quotation and the request with it.
create or replace function public.sync_quote_from_approval() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.quotations; next_quote text; next_request text; line text;
begin
  if new.status = old.status then return new; end if;
  if new.status = 'approved' then next_quote := 'approved'; next_request := 'approved'; line := 'You approved the quotation.';
  elsif new.status = 'declined' then next_quote := 'rejected'; next_request := 'under_review'; line := 'You rejected the quotation. Your coordinator will come back to you.';
  else next_quote := 'sent'; next_request := 'awaiting_approval'; line := 'You undid your decision. The quotation is waiting for you again.';
  end if;
  update public.quotations set status = next_quote
    where approval_id = new.id and status in ('sent','approved','rejected') returning * into q;
  if not found then return new; end if;
  update public.service_requests set status = next_request, updated_at = now() where id = q.request_id;
  insert into public.request_events (request_id, family_id, kind, status, body, actor_id, actor_name)
    values (q.request_id, q.family_id, 'quote', next_request, line, auth.uid(), 'You');
  return new;
end $$;

drop trigger if exists approvals_sync_quote on approvals;
create trigger approvals_sync_quote after update of status on approvals
  for each row execute function public.sync_quote_from_approval();

-- Only the family owner can ask for changes, and only while a quotation is waiting.
create or replace function public.request_quote_changes(p_quote uuid, p_note text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.quotations;
begin
  select * into q from public.quotations where id = p_quote for update;
  if not found or not public.is_family_owner(q.family_id) then raise exception 'not allowed'; end if;
  if q.status <> 'sent' then raise exception 'not waiting'; end if;
  update public.quotations set status = 'changes_requested', change_note = left(p_note, 500) where id = p_quote;
  update public.approvals set status = 'declined', decided_by = auth.uid(), decided_at = now() where id = q.approval_id;
  update public.service_requests set status = 'under_review', updated_at = now() where id = q.request_id;
  insert into public.request_events (request_id, family_id, kind, status, body, actor_id, actor_name)
    values (q.request_id, q.family_id, 'quote', 'under_review', 'You asked for changes: ' || left(p_note, 500), auth.uid(), 'You');
  insert into public.audit_log (actor_id, action, entity, entity_id, family_id)
    values (auth.uid(), 'quote_changes_requested', 'quotation', p_quote::text, q.family_id);
end $$;
revoke execute on function public.request_quote_changes(uuid, text) from public, anon;
grant execute on function public.request_quote_changes(uuid, text) to authenticated;
revoke execute on function public.sync_quote_from_approval() from public, anon, authenticated;

-- ---------- Properties and assets ----------
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('flat','house','plot','shop','vehicle','other')),
  address text,
  city text,
  tenant_name text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists properties_family_idx on properties (family_id);
alter table properties enable row level security;
create policy properties_visible on properties for select using (public.can_read_requests(family_id));
