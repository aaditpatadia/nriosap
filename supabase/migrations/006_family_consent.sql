-- Consent records per purpose, confirmed by a coordinator call. Approval execution state.

alter table consents alter column granted_at drop not null;
alter table consents add column subject text not null default 'parent' check (subject in ('parent','owner'));
alter table consents add column wording_version text;
alter table consents add column language text;
alter table consents add column confirmed_by uuid references profiles(id);
alter table consents add column confirmed_at timestamptz;
alter table consents add column confirm_method text check (confirm_method in ('coordinator_call','whatsapp_reply','owner_web'));
alter table consents add column notes text;
create unique index consents_unique_purpose on consents (parent_id, subject, purpose);

alter table parents add column consent_paused_reason text;

alter table approvals add column executed_at timestamptz;
alter table approvals add column execution_ref text;

create or replace function public.undo_approval(p_id uuid)
returns approvals language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.approvals;
begin
  select * into a from public.approvals where id = p_id for update;
  if not found or not public.is_family_owner(a.family_id) then raise exception 'not allowed'; end if;
  if a.status = 'pending' or a.undo_until is null or now() > a.undo_until or a.executed_at is not null then raise exception 'undo window has passed'; end if;
  update public.approvals set status = 'pending', decided_by = null, decided_at = null, undo_until = null
    where id = p_id returning * into a;
  insert into public.events (family_id, kind, actor, actor_name, text)
  values (a.family_id, 'approval', 'system', 'Desk', 'Undone: ' || a.summary);
  insert into public.audit_log (actor_id, action, entity, entity_id, family_id)
  values (auth.uid(), 'approval_undone', 'approval', p_id::text, a.family_id);
  return a;
end $$;

-- A coordinator records what the parent agreed to on the call. Owners cannot record this for a parent.
create or replace function public.confirm_parent_consent(p_parent uuid, p_purposes text[], p_notes text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare fid uuid; lang text; result text;
begin
  select family_id, language into fid, lang from public.parents where id = p_parent;
  if fid is null or not public.can_work_family(fid) then raise exception 'not allowed'; end if;
  update public.consents set granted_at = now(), withdrawn_at = null, confirmed_by = auth.uid(), confirmed_at = now(),
      confirm_method = 'coordinator_call', notes = p_notes, language = lang
    where parent_id = p_parent and subject = 'parent' and purpose = any(p_purposes);
  result := case when 'read_records' = any(p_purposes) and 'store' = any(p_purposes) then 'granted' else 'pending' end;
  update public.parents set consent_status = result, consent_paused_reason = null where id = p_parent;
  if result = 'granted' then update public.families set status = 'active' where id = fid; end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, family_id)
    values (auth.uid(), 'parent_consent_confirmed:' || array_to_string(p_purposes, ','), 'parent', p_parent::text, fid);
  insert into public.events (family_id, kind, actor, actor_name, text)
    select fid, 'system', 'human', name, 'Called your parent and confirmed their consent.' from public.profiles where id = auth.uid();
  return result;
end $$;

create or replace function public.confirm_owner_consent(p_family uuid, p_purposes text[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_family_owner(p_family) then raise exception 'not allowed'; end if;
  update public.consents c set granted_at = now(), withdrawn_at = null, confirmed_by = auth.uid(), confirmed_at = now(), confirm_method = 'owner_web'
    from public.parents p where p.id = c.parent_id and p.family_id = p_family and c.subject = 'owner' and c.purpose = any(p_purposes);
  insert into public.audit_log (actor_id, action, entity, entity_id, family_id)
    values (auth.uid(), 'owner_consent_confirmed:' || array_to_string(p_purposes, ','), 'family', p_family::text, p_family);
end $$;

-- Parent cannot give consent (illness, dementia): stop and route to counsel, as the PRD requires.
create or replace function public.pause_for_counsel(p_parent uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare fid uuid;
begin
  select family_id into fid from public.parents where id = p_parent;
  if fid is null or not public.can_work_family(fid) then raise exception 'not allowed'; end if;
  update public.parents set consent_status = 'pending', consent_paused_reason = p_reason where id = p_parent;
  update public.families set status = 'paused' where id = fid;
  insert into public.audit_log (actor_id, action, entity, entity_id, family_id) values (auth.uid(), 'consent_paused_for_counsel', 'parent', p_parent::text, fid);
end $$;

revoke execute on function public.confirm_parent_consent(uuid, text[], text) from public, anon;
revoke execute on function public.confirm_owner_consent(uuid, text[]) from public, anon;
revoke execute on function public.pause_for_counsel(uuid, text) from public, anon;
