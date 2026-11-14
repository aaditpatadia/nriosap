-- A quotation remembers the US dollar rate it was shown at, so it can always be read in both dollars and rupees. Additive only.
alter table quotations add column if not exists usd_per_inr numeric check (usd_per_inr is null or usd_per_inr > 0);
alter table quotations add column if not exists usd_as_of timestamptz;
