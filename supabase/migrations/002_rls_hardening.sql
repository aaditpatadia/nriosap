-- 001 could not run as written: can_see_family() read families under RLS and recursed
-- ("stack depth limit exceeded"). It also let owners update tasks, log time and edit any
-- approval column. This migration replaces those policies and adds the columns the app needs.

-- ---------- Columns the screens need ----------
alter table profiles add column if not exists email text;
alter table profiles add column if not exists city text;

alter table parents add column if not exists created_at timestamptz not null default now();
create unique index if not exists parents_phone_unique on parents (regexp_replace(phone, '\D', '', 'g'));

alter table documents add column if not exists title text not null default 'Document';
alter table documents add column if not exists prepared_by text not null default 'ai';

alter table approvals add column if not exists when_text text;
alter table approvals add column if not exists evidence_ids uuid[] not null default '{}';
alter table approvals add column if not exists requested_by uuid references profiles(id);
alter table approvals add column if not exists created_at timestamptz not null default now();

alter table audit_log add column if not exists family_id uuid;
alter table audit_log add column if not exists ip text;
create index if not exists audit_family_idx on audit_log (family_id, at desc);

create table if not exists claim_requirements (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  label text not null,
  received_at timestamptz,
  document_id uuid references documents(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table claim_requirements enable row level security;

create table if not exists document_consents (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  purpose text not null check (purpose in ('read_records','store','share_named_third_party','act_on_named_task')),
  scope text,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (document_id, purpose)
);
alter table document_consents enable row level security;

create index if not exists families_owner_idx on families (owner_id);
create index if not exists families_coord_idx on families (coordinator_id);
create index if not exists tasks_family_idx on tasks (family_id);
create index if not exists tasks_owner_idx on tasks (owner_id);
create index if not exists time_family_idx on time_entries (family_id, at);
create index if not exists events_family_idx on events (family_id, created_at desc);
create index if not exists messages_family_idx on messages (family_id, created_at);
create index if not exists documents_family_idx on documents (family_id);
create index if not exists approvals_family_idx on approvals (family_id);

-- ---------- Helpers. SECURITY DEFINER so policies do not recurse; identity always comes from auth.uid() ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','coordinator'));
$$;

create or replace function public.is_family_owner(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.families f where f.id = fid and f.owner_id = auth.uid());
$$;

create or replace function public.can_see_family(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or exists (
    select 1 from public.families f where f.id = fid and (f.owner_id = auth.uid() or f.coordinator_id = auth.uid())
  );
$$;

-- True for staff who can work on this family (an assigned coordinator, or an admin). Owners are excluded.
create or replace function public.can_work_family(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or exists (
    select 1 from public.families f join public.profiles p on p.id = auth.uid()
    where f.id = fid and f.coordinator_id = auth.uid() and p.role = 'coordinator'
  );
$$;

create or replace function public.shares_family(pid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.families f
    where (f.owner_id = auth.uid() and f.coordinator_id = pid)
       or (f.coordinator_id = auth.uid() and f.owner_id = pid)
  );
$$;

-- ---------- Replace the old policies ----------
drop policy if exists profiles_self on profiles;
drop policy if exists approvals_owner_update on approvals;
drop policy if exists time_coordinator_insert on time_entries;
drop policy if exists tasks_coordinator_update on tasks;

create policy profiles_visible on profiles for select
  using (id = auth.uid() or public.is_admin() or public.shares_family(id));
-- No update policy on profiles: role can never be changed from a user session.

create policy claim_req_visible on claim_requirements for select using (public.can_see_family(family_id));
create policy claim_req_work on claim_requirements for all
  using (public.can_work_family(family_id)) with check (public.can_work_family(family_id));

create policy doc_consent_visible on document_consents for select using (public.can_see_family(family_id));
create policy doc_consent_insert on document_consents for insert
  with check (public.can_see_family(family_id) and granted_by = auth.uid());

create policy tasks_work_insert on tasks for insert with check (public.can_work_family(family_id));
create policy tasks_work_update on tasks for update
  using (public.can_work_family(family_id)) with check (public.can_work_family(family_id));

create policy time_work_insert on time_entries for insert
  with check (user_id = auth.uid() and public.can_work_family(family_id));

create policy approvals_work_insert on approvals for insert
  with check (public.can_work_family(family_id) and status = 'pending' and decided_by is null and undo_until is null);
-- No update policy on approvals: decisions only go through decide_approval / undo_approval below.

create policy claims_work_insert on claims for insert with check (public.can_work_family(family_id));
create policy claims_work_update on claims for update
  using (public.can_work_family(family_id)) with check (public.can_work_family(family_id));

create policy policies_work_insert on policies for insert with check (public.can_work_family(family_id));
create policy policies_work_update on policies for update
  using (public.can_work_family(family_id)) with check (public.can_work_family(family_id));

create policy documents_insert on documents for insert with check (public.can_see_family(family_id));
create policy documents_work_update on documents for update
  using (public.can_work_family(family_id)) with check (public.can_work_family(family_id));

create policy events_work_insert on events for insert with check (public.can_work_family(family_id));
create policy messages_work_insert on messages for insert with check (public.can_work_family(family_id));

create policy parents_work_update on parents for update
  using (public.can_work_family(family_id)) with check (public.can_work_family(family_id));

create policy consents_work_insert on consents for insert
  with check (exists (select 1 from public.parents p where p.id = parent_id and public.can_see_family(p.family_id)));

-- ---------- Audit log: append only, owners read their own family ----------
create policy audit_owner_read on audit_log for select
  using (family_id is not null and public.is_family_owner(family_id));

create or replace function public.audit_event(p_action text, p_entity text, p_entity_id text, p_family_id uuid default null, p_ip text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_family_id is not null and not public.can_see_family(p_family_id) then raise exception 'not allowed'; end if;
  insert into public.audit_log(actor_id, action, entity, entity_id, family_id, ip)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_family_id, p_ip);
end $$;

create or replace function public.audit_log_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_log is append only'; end $$;

drop trigger if exists audit_no_change on audit_log;
create trigger audit_no_change before update or delete on audit_log
  for each row execute function public.audit_log_immutable();

-- ---------- New auth users always start as an owner. Staff roles are set by the service role only ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, role, name, email)
  values (new.id, 'owner', coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, 'Family owner'), '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Approvals: only the family owner can decide, and only through these functions ----------
create or replace function public.decide_approval(p_id uuid, p_status text)
returns approvals language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.approvals; who text;
begin
  if p_status not in ('approved','declined') then raise exception 'bad status'; end if;
  select * into a from public.approvals where id = p_id for update;
  if not found or not public.is_family_owner(a.family_id) then raise exception 'not allowed'; end if;
  if a.status <> 'pending' then raise exception 'already decided'; end if;
  update public.approvals set status = p_status, decided_by = auth.uid(), decided_at = now(),
    undo_until = now() + interval '5 minutes' where id = p_id returning * into a;
  select name into who from public.profiles where id = auth.uid();
  insert into public.events (family_id, kind, actor, actor_name, text)
  values (a.family_id, 'approval', 'human', who, case p_status when 'approved' then 'Approved: ' else 'Declined: ' end || a.summary);
  insert into public.audit_log (actor_id, action, entity, entity_id, family_id)
  values (auth.uid(), 'approval_' || p_status, 'approval', p_id::text, a.family_id);
  return a;
end $$;

create or replace function public.undo_approval(p_id uuid)
returns approvals language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.approvals;
begin
  select * into a from public.approvals where id = p_id for update;
  if not found or not public.is_family_owner(a.family_id) then raise exception 'not allowed'; end if;
  if a.status = 'pending' or a.undo_until is null or now() > a.undo_until then raise exception 'undo window has passed'; end if;
  update public.approvals set status = 'pending', decided_by = null, decided_at = null, undo_until = null
    where id = p_id returning * into a;
  insert into public.events (family_id, kind, actor, actor_name, text)
  values (a.family_id, 'approval', 'system', 'Desk', 'Undone: ' || a.summary);
  insert into public.audit_log (actor_id, action, entity, entity_id, family_id)
  values (auth.uid(), 'approval_undone', 'approval', p_id::text, a.family_id);
  return a;
end $$;

revoke execute on function public.decide_approval(uuid, text) from public, anon;
revoke execute on function public.undo_approval(uuid) from public, anon;
revoke execute on function public.audit_event(text, text, text, uuid, text) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
