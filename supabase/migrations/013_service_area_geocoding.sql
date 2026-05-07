create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

alter table public.businesses
add column if not exists base_geocoded_at timestamptz,
add column if not exists base_geocode_accuracy numeric(5, 4),
add column if not exists base_geocode_provider text;

alter table public.customers
add column if not exists geocoded_at timestamptz,
add column if not exists geocode_accuracy numeric(5, 4),
add column if not exists geocode_provider text;

alter table public.jobs
add column if not exists geocoded_at timestamptz,
add column if not exists geocode_accuracy numeric(5, 4),
add column if not exists geocode_provider text;

create index if not exists businesses_base_geography_idx
on public.businesses
using gist ((extensions.ST_SetSRID(extensions.ST_MakePoint(base_lng::double precision, base_lat::double precision), 4326)::extensions.geography))
where base_lat is not null and base_lng is not null;

create index if not exists customers_location_geography_idx
on public.customers
using gist ((extensions.ST_SetSRID(extensions.ST_MakePoint(lng::double precision, lat::double precision), 4326)::extensions.geography))
where lat is not null and lng is not null;

create index if not exists jobs_location_geography_idx
on public.jobs
using gist ((extensions.ST_SetSRID(extensions.ST_MakePoint(lng::double precision, lat::double precision), 4326)::extensions.geography))
where lat is not null and lng is not null;
