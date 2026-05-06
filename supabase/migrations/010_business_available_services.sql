alter table public.businesses
add column if not exists available_services text[] not null default array['landscaping', 'mowing', 'tree_cutting', 'yard_cleanup', 'irrigation']::text[];

alter table public.businesses
drop constraint if exists businesses_available_services_check;

alter table public.businesses
add constraint businesses_available_services_check
check (
  cardinality(available_services) > 0
  and available_services <@ array['landscaping', 'mowing', 'tree_cutting', 'yard_cleanup', 'irrigation']::text[]
);

alter table public.businesses
alter column ai_disclosure set default 'Hi, this is Ana with this business. How are you today? What service are you looking for?';
