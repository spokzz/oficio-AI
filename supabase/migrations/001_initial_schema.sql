-- Oficio AI initial Supabase schema
-- Run this in Supabase SQL Editor or through the Supabase CLI.

create extension if not exists pgcrypto;

create type public.app_role as enum ('owner', 'staff', 'platform_admin');
create type public.business_member_role as enum ('owner', 'manager', 'crew', 'viewer');
create type public.business_status as enum ('onboarding', 'live', 'needs_review', 'paused', 'canceled');
create type public.trade_type as enum ('landscaping', 'roofing', 'plumbing', 'cleaning', 'hvac', 'other');
create type public.job_status as enum ('lead', 'pending', 'confirmed', 'in_progress', 'completed', 'canceled');
create type public.quote_status as enum ('draft', 'needs_owner_approval', 'approved', 'sent', 'accepted', 'declined', 'expired');
create type public.message_channel as enum ('sms', 'mms', 'voice', 'email', 'in_app');
create type public.message_direction as enum ('inbound', 'outbound');
create type public.call_status as enum ('active', 'completed', 'missed', 'failed', 'transferred');
create type public.billing_status as enum ('trial', 'active', 'past_due', 'paused', 'canceled');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  preferred_language text not null default 'es',
  role public.app_role not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade public.trade_type not null default 'landscaping',
  status public.business_status not null default 'onboarding',
  phone text,
  owner_summary_language text not null default 'es',
  owner_summary_channel text not null default 'sms' check (owner_summary_channel in ('sms', 'email')),
  customer_default_language text not null default 'auto',
  base_address text,
  base_lat numeric(10, 7),
  base_lng numeric(10, 7),
  available_services text[] not null default array['landscaping', 'mowing', 'tree_cutting', 'yard_cleanup', 'irrigation']::text[],
  booking_time_zone text not null default 'America/Chicago',
  business_hours_text text not null default 'Monday through Friday, 8:00 AM to 5:00 PM',
  ai_voice_name text not null default 'Ana',
  ai_disclosure text not null default 'Hi, this is Ana with this business. How are you today? What service are you looking for?',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.business_member_role not null default 'owner',
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table public.service_radius_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  radius_miles integer not null default 30 check (radius_miles > 0),
  allow_outside_radius boolean not null default false,
  require_owner_approval_outside_radius boolean not null default true,
  extra_travel_fee numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  preferred_language text not null default 'auto',
  address text,
  lat numeric(10, 7),
  lng numeric(10, 7),
  referral_source text,
  referred_by_customer_id uuid references public.customers(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  title text not null,
  service_type text,
  status public.job_status not null default 'lead',
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  address text,
  lat numeric(10, 7),
  lng numeric(10, 7),
  estimated_value numeric(10, 2),
  final_value numeric(10, 2),
  owner_notes text,
  ai_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  status public.quote_status not null default 'draft',
  service_type text,
  intake_answers jsonb not null default '{}'::jsonb,
  photo_urls text[] not null default '{}',
  ai_observations text,
  suggested_low numeric(10, 2),
  suggested_high numeric(10, 2),
  owner_price numeric(10, 2),
  owner_approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  channel public.message_channel not null default 'sms',
  direction public.message_direction not null,
  from_phone text,
  to_phone text,
  language text,
  body text not null,
  media_urls text[] not null default '{}',
  provider_message_id text,
  created_at timestamptz not null default now()
);

create table public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  provider_call_id text,
  from_phone text,
  to_phone text,
  detected_language text,
  status public.call_status not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  transcript text,
  outcome text,
  created_at timestamptz not null default now()
);

create table public.ai_summaries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  call_session_id uuid references public.call_sessions(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  summary_language text not null default 'es',
  summary text not null,
  action_needed text,
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now()
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null,
  quantity numeric(12, 4) not null default 1,
  unit text not null,
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table public.manual_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  plan_name text not null default 'Growth',
  monthly_price numeric(10, 2) not null default 149,
  onboarding_fee numeric(10, 2) not null default 199,
  onboarding_paid boolean not null default false,
  billing_status public.billing_status not null default 'trial',
  next_payment_due_at date,
  payment_method_note text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger businesses_set_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

create trigger service_radius_rules_set_updated_at
before update on public.service_radius_rules
for each row execute function public.set_updated_at();

create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

create trigger quotes_set_updated_at
before update on public.quotes
for each row execute function public.set_updated_at();

create trigger manual_billing_accounts_set_updated_at
before update on public.manual_billing_accounts
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'platform_admin'
  );
$$;

create or replace function public.can_access_business(target_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.business_users
      where business_id = target_business_id
        and user_id = auth.uid()
    );
$$;

alter table public.users enable row level security;
alter table public.businesses enable row level security;
alter table public.business_users enable row level security;
alter table public.service_radius_rules enable row level security;
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.quotes enable row level security;
alter table public.messages enable row level security;
alter table public.call_sessions enable row level security;
alter table public.ai_summaries enable row level security;
alter table public.usage_events enable row level security;
alter table public.manual_billing_accounts enable row level security;

create policy "users can read own profile or admins read all"
on public.users for select
to authenticated
using (id = auth.uid() or public.is_platform_admin());

create policy "users can update own basic profile or admins update all"
on public.users for update
to authenticated
using (id = auth.uid() or public.is_platform_admin())
with check (id = auth.uid() or public.is_platform_admin());

create policy "business members can read businesses"
on public.businesses for select
to authenticated
using (public.can_access_business(id));

create policy "business members can update businesses"
on public.businesses for update
to authenticated
using (public.can_access_business(id))
with check (public.can_access_business(id));

create policy "admins can create businesses"
on public.businesses for insert
to authenticated
with check (public.is_platform_admin());

create policy "business members can read memberships"
on public.business_users for select
to authenticated
using (public.can_access_business(business_id));

create policy "admins manage memberships"
on public.business_users for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "members read radius rules"
on public.service_radius_rules for select
to authenticated
using (public.can_access_business(business_id));

create policy "members manage radius rules"
on public.service_radius_rules for all
to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));

create policy "members manage customers"
on public.customers for all
to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));

create policy "members manage jobs"
on public.jobs for all
to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));

create policy "members manage quotes"
on public.quotes for all
to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));

create policy "members manage messages"
on public.messages for all
to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));

create policy "members read call sessions"
on public.call_sessions for select
to authenticated
using (public.can_access_business(business_id));

create policy "members create call sessions"
on public.call_sessions for insert
to authenticated
with check (public.can_access_business(business_id));

create policy "members update call sessions"
on public.call_sessions for update
to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));

create policy "members read ai summaries"
on public.ai_summaries for select
to authenticated
using (public.can_access_business(business_id));

create policy "members create ai summaries"
on public.ai_summaries for insert
to authenticated
with check (public.can_access_business(business_id));

create policy "members read usage"
on public.usage_events for select
to authenticated
using (public.can_access_business(business_id));

create policy "admins manage usage"
on public.usage_events for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "members read billing"
on public.manual_billing_accounts for select
to authenticated
using (public.can_access_business(business_id));

create policy "admins manage billing"
on public.manual_billing_accounts for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create index businesses_status_idx on public.businesses(status);
create index business_users_user_id_idx on public.business_users(user_id);
create index customers_business_id_idx on public.customers(business_id);
create index jobs_business_id_status_idx on public.jobs(business_id, status);
create index jobs_scheduled_start_idx on public.jobs(scheduled_start);
create index quotes_business_id_status_idx on public.quotes(business_id, status);
create index messages_business_id_created_at_idx on public.messages(business_id, created_at desc);
create index call_sessions_business_id_started_at_idx on public.call_sessions(business_id, started_at desc);
create index ai_summaries_business_id_created_at_idx on public.ai_summaries(business_id, created_at desc);
create index usage_events_business_id_occurred_at_idx on public.usage_events(business_id, occurred_at desc);
