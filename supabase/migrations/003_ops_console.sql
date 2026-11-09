-- Ops console: timers that survive refresh, notes, templates, escalation contacts.

alter table tasks add column if not exists created_at timestamptz not null default now();
alter table tasks add column if not exists template_id uuid;
alter table tasks add column if not exists checklist text[] not null default '{}';
alter table time_entries add column if not exists source text not null default 'timer' check (source in ('timer','manual'));

-- One running timer per person. started_at is the only state, so a page refresh changes nothing.
create table timers (
  user_id uuid primary key references profiles(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  started_at timestamptz not null default now()
);
alter table timers enable row level security;
create policy timers_own on timers for all
  using (user_id = auth.uid() and public.can_work_family(family_id))
  with check (user_id = auth.uid() and public.can_work_family(family_id));

create table task_notes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  author_id uuid not null references profiles(id),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table task_notes enable row level security;
create index task_notes_task_idx on task_notes (task_id, created_at desc);
create policy notes_work_read on task_notes for select using (public.can_work_family(family_id));
create policy notes_work_insert on task_notes for insert
  with check (author_id = auth.uid() and public.can_work_family(family_id));

create table task_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('claim','bill','records','errand','checkin','renewal')),
  title text not null,
  checklist text[] not null default '{}',
  hour_budget numeric(4,1) not null,
  sla_hours int not null,
  needs_approval boolean not null default false
);
alter table task_templates enable row level security;
create policy templates_staff_read on task_templates for select using (public.is_staff());
create policy templates_admin_write on task_templates for all using (public.is_admin()) with check (public.is_admin());

-- Hours per occurrence come from the task library in the unit economics model.
insert into task_templates (name, kind, title, checklist, hour_budget, sla_hours, needs_approval) values
  ('Reimbursement claim', 'claim', 'Prepare reimbursement claim', array['Collect discharge summary','Collect itemised bill','Collect cancelled cheque','Check policy number and dates','Owner approves before filing'], 4, 96, true),
  ('Cashless support', 'claim', 'Support cashless admission', array['Confirm hospital is in network','Get pre-authorisation form from desk','Track insurer reply (1 hour rule)','Track discharge approval (3 hour rule)'], 6, 4, true),
  ('Records collection', 'records', 'Collect records', array['List what is needed','Parent or hospital shares copies','Add to vault with consent purposes'], 2, 72, false),
  ('Bill payment', 'bill', 'Prepare bill for payment', array['Read bill and check amount','Raise approval with payee, amount and fees','Pay only after owner approves','Save receipt'], 0.3, 48, true),
  ('Doctor booking', 'errand', 'Book doctor appointment', array['Confirm doctor and time with parent','Book','Send reminder the day before'], 0.5, 24, false),
  ('Monthly check-in', 'checkin', 'Monthly check-in call', array['Call in parent''s language','Note anything new','Update the family timeline'], 0.5, 72, false),
  ('Policy renewal', 'renewal', 'Prepare policy renewal', array['Check renewal date and premium','Raise approval with amount','Renew only after owner approves'], 1, 168, true),
  ('Ad hoc errand', 'errand', 'Errand', array['Agree what is needed','Do it','Send proof to the family'], 1, 48, false);

create table partner_contacts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ca','advocate','hospital_desk')),
  name text not null,
  phone text,
  email text,
  city text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table partner_contacts enable row level security;
create policy partners_staff_read on partner_contacts for select using (public.is_staff());
create policy partners_admin_write on partner_contacts for all using (public.is_admin()) with check (public.is_admin());

create table escalations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  contact_id uuid not null references partner_contacts(id),
  kind text not null check (kind in ('ca','advocate','hospital_desk')),
  brief text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
alter table escalations enable row level security;
create index escalations_task_idx on escalations (task_id);
create policy escalations_work_read on escalations for select using (public.can_work_family(family_id));
create policy escalations_work_insert on escalations for insert
  with check (created_by = auth.uid() and public.can_work_family(family_id));
