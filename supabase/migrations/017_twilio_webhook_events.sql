create table if not exists public.twilio_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null,
  route text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists twilio_webhook_events_provider_event_id_idx
on public.twilio_webhook_events(provider_event_id);

create index if not exists twilio_webhook_events_created_at_idx
on public.twilio_webhook_events(created_at desc);

alter table public.twilio_webhook_events enable row level security;

create table if not exists public.active_voice_call_leases (
  call_session_id uuid primary key references public.call_sessions(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  twilio_call_sid text,
  twilio_stream_sid text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists active_voice_call_leases_business_expires_idx
on public.active_voice_call_leases(business_id, expires_at);

create unique index if not exists active_voice_call_leases_twilio_stream_sid_idx
on public.active_voice_call_leases(twilio_stream_sid)
where twilio_stream_sid is not null;

create unique index if not exists active_voice_call_leases_twilio_call_sid_idx
on public.active_voice_call_leases(twilio_call_sid)
where twilio_call_sid is not null;

alter table public.active_voice_call_leases enable row level security;

create or replace function public.reserve_active_voice_call_lease(
  p_business_id uuid,
  p_call_session_id uuid,
  p_twilio_call_sid text,
  p_twilio_stream_sid text,
  p_max_active integer,
  p_expires_at timestamptz
)
returns table(reserved boolean, active_calls integer, max_active integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_active integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 0));

  delete from public.active_voice_call_leases
  where expires_at <= now();

  select count(*) into current_active
  from public.active_voice_call_leases
  where business_id = p_business_id;

  if exists (
    select 1
    from public.active_voice_call_leases
    where call_session_id = p_call_session_id
  ) then
    return query select false, current_active, p_max_active;
    return;
  end if;

  if current_active >= p_max_active then
    return query select false, current_active, p_max_active;
    return;
  end if;

  insert into public.active_voice_call_leases (
    business_id,
    call_session_id,
    twilio_call_sid,
    twilio_stream_sid,
    expires_at
  )
  values (
    p_business_id,
    p_call_session_id,
    p_twilio_call_sid,
    p_twilio_stream_sid,
    p_expires_at
  );

  return query select true, current_active + 1, p_max_active;
end;
$$;
