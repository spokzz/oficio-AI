create table if not exists public.owner_sms_pending_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  owner_phone text not null,
  kind text not null check (kind in ('confirmation', 'follow_up', 'selection')),
  action_type text not null,
  language text not null default 'en' check (language in ('en', 'es')),
  target_type text,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'completed', 'canceled', 'expired', 'failed')),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_sms_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  owner_phone text not null,
  direction public.message_direction not null,
  language text not null default 'en' check (language in ('en', 'es')),
  body text not null,
  provider_message_id text,
  created_at timestamptz not null default now()
);

drop trigger if exists owner_sms_pending_actions_set_updated_at on public.owner_sms_pending_actions;
create trigger owner_sms_pending_actions_set_updated_at
before update on public.owner_sms_pending_actions
for each row execute function public.set_updated_at();

create unique index if not exists owner_sms_pending_actions_one_pending_idx
on public.owner_sms_pending_actions(business_id, owner_user_id)
where status = 'pending';

create index if not exists owner_sms_pending_actions_lookup_idx
on public.owner_sms_pending_actions(business_id, owner_user_id, status, expires_at desc);

create index if not exists owner_sms_history_business_created_idx
on public.owner_sms_history(business_id, created_at desc);

create index if not exists owner_sms_history_owner_created_idx
on public.owner_sms_history(owner_user_id, created_at desc);

alter table public.owner_sms_pending_actions enable row level security;
alter table public.owner_sms_history enable row level security;

drop policy if exists "members read owner sms pending actions" on public.owner_sms_pending_actions;
create policy "members read owner sms pending actions"
on public.owner_sms_pending_actions for select
to authenticated
using (public.can_access_business(business_id));

drop policy if exists "members manage owner sms pending actions" on public.owner_sms_pending_actions;

drop policy if exists "members read owner sms history" on public.owner_sms_history;
create policy "members read owner sms history"
on public.owner_sms_history for select
to authenticated
using (public.can_access_business(business_id));

drop policy if exists "members create owner sms history" on public.owner_sms_history;
