create table if not exists public.customer_recurring_reminders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_type text,
  interval_weeks integer not null check (interval_weeks between 1 and 52),
  due_at date not null,
  last_service_at timestamptz,
  status text not null default 'due' check (status in ('due', 'dismissed', 'scheduled', 'stale')),
  generated_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, due_at)
);

drop trigger if exists customer_recurring_reminders_set_updated_at on public.customer_recurring_reminders;
create trigger customer_recurring_reminders_set_updated_at
before update on public.customer_recurring_reminders
for each row execute function public.set_updated_at();

create index if not exists customer_recurring_reminders_business_status_due_idx
on public.customer_recurring_reminders(business_id, status, due_at);

create index if not exists customer_recurring_reminders_customer_status_idx
on public.customer_recurring_reminders(customer_id, status);

alter table public.customer_recurring_reminders enable row level security;

drop policy if exists "members read customer recurring reminders" on public.customer_recurring_reminders;
create policy "members read customer recurring reminders"
on public.customer_recurring_reminders for select
to authenticated
using (public.can_access_business(business_id));

drop policy if exists "members manage customer recurring reminders" on public.customer_recurring_reminders;
create policy "members manage customer recurring reminders"
on public.customer_recurring_reminders for all
to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));
