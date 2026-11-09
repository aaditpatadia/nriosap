-- Supabase exposes tables through its REST API to any signed-in user, so policies must hold on their own.
-- The app writes these rows from the server after its own checks, so user sessions need no insert rights.
drop policy if exists consents_work_insert on consents;
drop policy if exists documents_insert on documents;
drop policy if exists doc_consent_insert on document_consents;

-- Staff may only touch their own alerts, and cannot move one to another family.
drop policy if exists alerts_staff_resolve on alerts;
create policy alerts_staff_resolve on alerts for update
  using (public.is_admin() or (family_id is not null and public.can_work_family(family_id)))
  with check (public.is_admin() or (family_id is not null and public.can_work_family(family_id)));
