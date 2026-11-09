-- A customer can now ask for work with no parent involved. They become the contact person on their own record.
alter table parents add column if not exists is_self boolean not null default false;
