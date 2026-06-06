alter table public.businesses
add column if not exists minute_limit_policy text not null default 'continue_overage';

alter table public.businesses
drop constraint if exists businesses_minute_limit_policy_check;

alter table public.businesses
add constraint businesses_minute_limit_policy_check
check (minute_limit_policy in ('continue_overage', 'voicemail', 'forward_owner'));

alter table public.call_sessions
add column if not exists voicemail_recording_sid text,
add column if not exists voicemail_recording_url text,
add column if not exists voicemail_recording_duration_seconds integer;

alter table public.call_sessions
drop constraint if exists call_sessions_voicemail_duration_check;

alter table public.call_sessions
add constraint call_sessions_voicemail_duration_check
check (voicemail_recording_duration_seconds is null or voicemail_recording_duration_seconds >= 0);
