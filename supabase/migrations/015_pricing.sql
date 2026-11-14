-- Pricing for Mumbai work: a rate card the desk can change, a saved breakdown per price, exchange rates,
-- the details a customer gives about where and when, and a 100% advance rule on quotations. Additive only.

-- Where and when the customer wants the work done, and what is being carried.
alter table service_requests add column if not exists details jsonb not null default '{}'::jsonb;

-- The rate card. Every change is a new row, so an old price can always be explained by the card it used.
create table if not exists rate_cards (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  config jsonb not null,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (version)
);
alter table rate_cards enable row level security;
create policy rate_cards_staff on rate_cards for select using (public.is_staff());

-- Exchange rates for showing a price in the customer's own currency. Public information.
create table if not exists fx_rates (
  currency text primary key check (currency ~ '^[A-Z]{3}$'),
  per_inr numeric not null check (per_inr > 0),
  as_of timestamptz not null,
  source text not null,
  set_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
alter table fx_rates enable row level security;
create policy fx_rates_read on fx_rates for select using (auth.uid() is not null);

-- One saved breakdown per price. The inputs and the result are kept as they were when the price was made.
create table if not exists price_estimates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  request_id uuid references service_requests(id) on delete cascade,
  rate_card_id uuid references rate_cards(id),
  inputs jsonb not null,
  breakdown jsonb not null,
  total_inr bigint not null check (total_inr >= 0),
  ally_fee_inr bigint not null default 0,
  currency text not null default 'INR',
  fx_per_inr numeric,
  fx_as_of timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists price_estimates_request_idx on price_estimates (request_id);
alter table price_estimates enable row level security;
-- Only the desk sees how a price was built. The customer sees the quotation made from it.
create policy price_estimates_staff on price_estimates for select using (
  case when family_id is null then public.is_staff() else public.can_work_family(family_id) end
);

-- A quotation remembers the estimate behind it, that it is paid in full first, and the customer's currency at the time.
alter table quotations add column if not exists estimate_id uuid references price_estimates(id) on delete set null;
alter table quotations add column if not exists advance_percent int not null default 100 check (advance_percent between 0 and 100);
alter table quotations add column if not exists currency text not null default 'INR';
alter table quotations add column if not exists fx_per_inr numeric;
alter table quotations add column if not exists fx_as_of timestamptz;
