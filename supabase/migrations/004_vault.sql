-- Document vault: upload metadata, scan and extraction state, per-document consent withdrawal.

alter table documents add column mime text;
alter table documents add column size_bytes int;
alter table documents add column scan_status text not null default 'not_scanned' check (scan_status in ('not_scanned','basic_only','clean','infected'));
alter table documents add column extraction_status text not null default 'pending' check (extraction_status in ('pending','done','failed','skipped'));
alter table documents add column uploaded_by uuid references profiles(id);
alter table documents add column source text not null default 'web' check (source in ('web','whatsapp','seed'));
alter table documents add column deleted_at timestamptz;

alter table tasks add column document_id uuid references documents(id) on delete set null;
alter table policies add constraint policies_document_unique unique (document_id);

-- Owners can withdraw a purpose for one document. The desk records a withdrawal on a parent's behalf.
create or replace function public.withdraw_document_consent(p_document uuid, p_purpose text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare fid uuid;
begin
  select family_id into fid from public.documents where id = p_document;
  if fid is null or not public.can_see_family(fid) then raise exception 'not allowed'; end if;
  update public.document_consents set withdrawn_at = now()
    where document_id = p_document and purpose = p_purpose and withdrawn_at is null;
  insert into public.audit_log (actor_id, action, entity, entity_id, family_id)
    values (auth.uid(), 'document_consent_withdrawn:' || p_purpose, 'document', p_document::text, fid);
end $$;
revoke execute on function public.withdraw_document_consent(uuid, text) from public, anon;
