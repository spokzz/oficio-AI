alter table public.call_sessions
add column if not exists twilio_stream_sid text,
add column if not exists extracted_data jsonb not null default '{}'::jsonb;

comment on column public.call_sessions.provider_call_id is 'Twilio CallSid for voice calls.';
comment on column public.call_sessions.twilio_stream_sid is 'Twilio Media Streams StreamSid for realtime voice calls.';

create index if not exists call_sessions_twilio_stream_sid_idx on public.call_sessions(twilio_stream_sid);
create index if not exists call_sessions_status_idx on public.call_sessions(status);
create index if not exists call_sessions_business_status_idx on public.call_sessions(business_id, status);
