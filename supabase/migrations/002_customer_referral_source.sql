-- Safe to run even if referral_source already exists from the initial schema.
alter table public.customers
add column if not exists referral_source text;

update public.customers
set referral_source = 'other'
where referral_source = 'manual';

alter table public.customers
drop constraint if exists customers_referral_source_check;

alter table public.customers
add constraint customers_referral_source_check
check (
  referral_source is null
  or referral_source in ('referral', 'facebook', 'google', 'website', 'instagram', 'other')
);
