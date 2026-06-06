create table if not exists public.owner_daily_agenda_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  owner_phone text not null,
  agenda_date date not null,
  time_zone text not null,
  language text not null check (language in ('en', 'es')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  message_body text not null,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, owner_user_id, agenda_date)
);

drop trigger if exists owner_daily_agenda_deliveries_set_updated_at on public.owner_daily_agenda_deliveries;
create trigger owner_daily_agenda_deliveries_set_updated_at
before update on public.owner_daily_agenda_deliveries
for each row execute function public.set_updated_at();

create index if not exists owner_daily_agenda_deliveries_business_date_idx
on public.owner_daily_agenda_deliveries(business_id, agenda_date desc);

alter table public.owner_daily_agenda_deliveries enable row level security;

drop policy if exists "members read owner daily agenda deliveries" on public.owner_daily_agenda_deliveries;
create policy "members read owner daily agenda deliveries"
on public.owner_daily_agenda_deliveries for select
to authenticated
using (public.can_access_business(business_id));

drop policy if exists "members manage owner daily agenda deliveries" on public.owner_daily_agenda_deliveries;
