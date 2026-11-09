-- Repeated failed sign-ins raise an alert. These have no family, so only admins can read or clear them.
alter table alerts drop constraint if exists alerts_kind_check;
alter table alerts add constraint alerts_kind_check check (kind in ('sla','hours','no_reply','renewal','bill','security'));
