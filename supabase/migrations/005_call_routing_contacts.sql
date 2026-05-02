create type public.contact_classification as enum ('customer', 'personal', 'vendor', 'spam', 'unknown');

alter table public.businesses
add column if not exists twilio_routing_phone text,
add column if not exists owner_transfer_phone text;

create unique index if not exists businesses_twilio_routing_phone_unique
on public.businesses (twilio_routing_phone)
where twilio_routing_phone is not null;

alter table public.call_sessions
add column if not exists contact_type public.contact_classification not null default 'unknown',
add column if not exists screening_result text,
add column if not exists needs_owner_review boolean not null default false,
add column if not exists qualified_business_seconds integer not null default 0 check (qualified_business_seconds >= 0),
add column if not exists transferred_to_owner_at timestamptz,
add column if not exists owner_confirmation_sent_at timestamptz,
add column if not exists owner_confirmation_message_sid text;

create table if not exists public.caller_contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  phone text not null,
  display_name text,
  classification public.contact_classification not null default 'unknown',
  notes text,
  confirmed_by_owner_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone)
);

create table if not exists public.owner_contact_confirmations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  call_session_id uuid references public.call_sessions(id) on delete cascade,
  owner_user_id uuid references public.users(id) on delete set null,
  owner_phone text not null,
  caller_phone text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'answered', 'failed', 'canceled')),
  owner_response text check (owner_response is null or owner_response in ('yes_personal', 'no_business')),
  prompt_body text not null,
  due_at timestamptz not null,
  sent_at timestamptz,
  answered_at timestamptz,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger caller_contacts_set_updated_at
before update on public.caller_contacts
for each row execute function public.set_updated_at();

create trigger owner_contact_confirmations_set_updated_at
before update on public.owner_contact_confirmations
for each row execute function public.set_updated_at();

alter table public.caller_contacts enable row level security;
alter table public.owner_contact_confirmations enable row level security;

create policy "members manage caller contacts"
on public.caller_contacts for all
to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));

create policy "members read owner contact confirmations"
on public.owner_contact_confirmations for select
to authenticated
using (public.can_access_business(business_id));

create policy "members update owner contact confirmations"
on public.owner_contact_confirmations for update
to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));

create index if not exists caller_contacts_business_phone_idx on public.caller_contacts(business_id, phone);
create index if not exists caller_contacts_business_classification_idx on public.caller_contacts(business_id, classification);
create index if not exists owner_contact_confirmations_due_idx on public.owner_contact_confirmations(status, due_at);
create index if not exists owner_contact_confirmations_owner_phone_idx on public.owner_contact_confirmations(owner_phone, created_at desc);
create index if not exists call_sessions_provider_call_id_idx on public.call_sessions(provider_call_id);
create index if not exists call_sessions_business_contact_type_idx on public.call_sessions(business_id, contact_type, started_at desc);
