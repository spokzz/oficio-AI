create table if not exists public.business_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null default 'Closed',
  starts_on date not null,
  ends_on date not null,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

drop trigger if exists business_availability_exceptions_set_updated_at on public.business_availability_exceptions;
create trigger business_availability_exceptions_set_updated_at
before update on public.business_availability_exceptions
for each row execute function public.set_updated_at();

create index if not exists business_availability_exceptions_business_dates_idx
on public.business_availability_exceptions(business_id, starts_on, ends_on);

alter table public.business_availability_exceptions enable row level security;

drop policy if exists "members read business availability exceptions" on public.business_availability_exceptions;
create policy "members read business availability exceptions"
on public.business_availability_exceptions for select
to authenticated
using (public.can_access_business(business_id));

drop policy if exists "members manage business availability exceptions" on public.business_availability_exceptions;
create policy "members manage business availability exceptions"
on public.business_availability_exceptions for all
to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));
