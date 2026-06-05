create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_json jsonb,
  after_json jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.audit_events enable row level security;

drop policy if exists "members read audit events" on public.audit_events;
create policy "members read audit events"
on public.audit_events for select
to authenticated
using (public.can_access_business(business_id));

drop policy if exists "members create audit events" on public.audit_events;
create policy "members create audit events"
on public.audit_events for insert
to authenticated
with check (public.can_access_business(business_id));

create index if not exists audit_events_business_created_idx on public.audit_events(business_id, created_at desc);
create index if not exists audit_events_actor_created_idx on public.audit_events(actor_user_id, created_at desc);
create index if not exists audit_events_entity_idx on public.audit_events(entity_type, entity_id);
create index if not exists audit_events_action_idx on public.audit_events(action);
