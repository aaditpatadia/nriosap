-- Payment records for approved costs, and plan wording that promises only what the desk can deliver. Additive only.

-- Ally does not take or hold this money. A record says how the customer pays the provider directly,
-- and whether that payment was confirmed, with the receipt or reference that proves it.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  request_id uuid not null references service_requests(id) on delete cascade,
  quotation_id uuid references quotations(id) on delete set null,
  payee text not null,
  amount_inr bigint not null check (amount_inr >= 0),
  method text not null check (method in ('provider_link','bank_transfer','other')),
  link_url text check (link_url is null or link_url like 'https://%'),
  status text not null default 'pending' check (status in ('pending','confirmed','failed')),
  reference text,
  receipt_document_id uuid references documents(id) on delete set null,
  note text,
  recorded_by uuid references profiles(id),
  confirmed_by uuid references profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Confirmed only with something that shows it: a receipt or a payment reference.
  constraint payments_confirmed_has_proof check (status <> 'confirmed' or receipt_document_id is not null or coalesce(reference, '') <> '')
);
create index if not exists payments_request_idx on payments (request_id);
alter table payments enable row level security;
create policy payments_visible on payments for select using (public.can_see_family(family_id));

-- Plan wording. Changed only where an admin has not already edited it.
update plans set features = array['Everything in Family','Priority in the coordinator queue','Hospital desk support','In-person visits are quoted before they happen'], includes_visits = false, blurb = 'For a lot going on back home.', updated_at = now()
  where slug = 'plus' and features = array['Everything in Family','Priority in the coordinator queue','In-person visits arranged within your plan','Hospital desk support'];
update plans set features = array['Everything in Lite','No monthly limit on new requests','Errands, property and paper chasing','Help with claims paperwork','Updates from your coordinator as the work moves','In-person visits are quoted before they happen'], updated_at = now()
  where slug = 'family' and features = array['Everything in Lite','No monthly limit on new requests','Errands, property and paper chasing','Help with claims paperwork','Weekly updates from your coordinator','In-person visits are quoted before they happen'];
