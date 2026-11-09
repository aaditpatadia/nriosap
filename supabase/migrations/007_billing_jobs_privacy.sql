-- Subscription mirror from Stripe, alerts for the desk, rate limits, parent consent withdrawal.

create table subscriptions (
  family_id uuid primary key references families(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'none',
  price_usd numeric(6,2),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table subscriptions enable row level security;
-- Rows are written only by the Stripe webhook through the service role.
create policy subscriptions_visible on subscriptions for select using (public.can_see_family(family_id));

create table stripe_events (id text primary key, received_at timestamptz not null default now());
alter table stripe_events enable row level security;

create table alerts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  kind text not null check (kind in ('sla','hours','no_reply','renewal','bill')),
  dedupe_key text not null unique,
  body text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table alerts enable row level security;
create index alerts_open_idx on alerts (created_at desc) where resolved_at is null;
create policy alerts_staff_read on alerts for select using (public.is_admin() or (family_id is not null and public.can_work_family(family_id)));
create policy alerts_staff_resolve on alerts for update using (public.is_admin() or (family_id is not null and public.can_work_family(family_id))) with check (true);

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
alter table rate_limits enable row level security;

create or replace function public.withdraw_parent_consent(p_parent uuid, p_via text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare fid uuid;
begin
  select family_id into fid from public.parents where id = p_parent;
  if fid is null or not public.can_see_family(fid) then raise exception 'not allowed'; end if;
  update public.consents set withdrawn_at = now() where parent_id = p_parent and subject = 'parent' and withdrawn_at is null and granted_at is not null;
  update public.parents set consent_status = 'withdrawn' where id = p_parent;
  update public.families set status = 'paused' where id = fid;
  insert into public.audit_log (actor_id, action, entity, entity_id, family_id) values (auth.uid(), 'parent_consent_withdrawn:' || p_via, 'parent', p_parent::text, fid);
  insert into public.events (family_id, kind, actor, actor_name, text) values (fid, 'system', 'system', 'Desk', 'Consent was withdrawn. The desk has stopped work for this parent.');
end $$;
revoke execute on function public.withdraw_parent_consent(uuid, text) from public, anon;
