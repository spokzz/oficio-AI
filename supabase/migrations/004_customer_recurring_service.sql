alter table public.customers
add column if not exists recurring_service_type text,
add column if not exists recurring_interval_weeks integer;

alter table public.customers
drop constraint if exists customers_recurring_interval_weeks_check;

alter table public.customers
add constraint customers_recurring_interval_weeks_check
check (recurring_interval_weeks is null or recurring_interval_weeks between 1 and 52);
