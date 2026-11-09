-- WhatsApp: idempotent inbound, media, voice notes, drafts that need a human click.

alter table messages add column wa_id text;
create unique index messages_wa_id_unique on messages (wa_id) where wa_id is not null;
alter table messages add column parent_id uuid references parents(id) on delete set null;
alter table messages add column status text not null default 'received'
  check (status in ('received','draft','blocked','approved_not_sent','sent','failed'));
alter table messages add column msg_type text not null default 'text'
  check (msg_type in ('text','image','document','audio','template'));
alter table messages add column document_id uuid references documents(id) on delete set null;
alter table messages add column transcript text;
alter table messages add column transcript_status text check (transcript_status in ('pending','done','failed','not_configured'));
alter table messages add column template_name text;
alter table messages add column drafted_by uuid references profiles(id);
alter table messages add column approved_by uuid references profiles(id);
alter table messages add column approved_at timestamptz;

-- Coordinators edit their own drafts; sending goes through the server, which re-checks the advice filter.
create policy messages_work_update on messages for update
  using (public.can_work_family(family_id)) with check (public.can_work_family(family_id));

-- Counts of webhook traffic that matched no parent. No phone numbers or text are kept.
create table webhook_unmatched (
  day date primary key default current_date,
  count int not null default 0
);
alter table webhook_unmatched enable row level security;
create policy unmatched_admin_read on webhook_unmatched for select using (public.is_admin());
