create table if not exists public.owner_booking_confirmations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  call_session_id uuid references public.call_sessions(id) on delete set null,
  owner_phone text not null,
  customer_phone text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'approved', 'declined', 'failed', 'canceled')),
  owner_response text check (owner_response is null or owner_response in ('yes_approve', 'no_decline')),
  prompt_body text not null,
  customer_confirmation_body text not null,
  due_at timestamptz not null default now(),
  sent_at timestamptz,
  answered_at timestamptz,
  provider_message_id text,
  customer_message_sid text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists owner_booking_confirmations_set_updated_at on public.owner_booking_confirmations;
create trigger owner_booking_confirmations_set_updated_at
before update on public.owner_booking_confirmations
for each row execute function public.set_updated_at();

alter table public.owner_booking_confirmations enable row level security;

drop policy if exists "members read owner booking confirmations" on public.owner_booking_confirmations;
create policy "members read owner booking confirmations"
on public.owner_booking_confirmations for select
to authenticated
using (public.can_access_business(business_id));

drop policy if exists "members update owner booking confirmations" on public.owner_booking_confirmations;
create policy "members update owner booking confirmations"
on public.owner_booking_confirmations for update
to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));

create index if not exists owner_booking_confirmations_due_idx
on public.owner_booking_confirmations(status, due_at);

create index if not exists owner_booking_confirmations_owner_phone_idx
on public.owner_booking_confirmations(owner_phone, created_at desc);

create index if not exists owner_booking_confirmations_job_idx
on public.owner_booking_confirmations(job_id);
