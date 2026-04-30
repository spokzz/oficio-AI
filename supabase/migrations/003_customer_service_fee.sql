alter table public.customers
add column if not exists service_fee numeric(10, 2);

alter table public.customers
drop constraint if exists customers_service_fee_check;

alter table public.customers
add constraint customers_service_fee_check
check (service_fee is null or service_fee >= 0);
