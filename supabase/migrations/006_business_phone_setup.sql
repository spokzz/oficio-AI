alter table public.businesses
add column if not exists phone_setup_mode text not null default 'twilio_number',
add column if not exists voice_setup_status text not null default 'not_started',
add column if not exists sms_setup_status text not null default 'not_started',
add column if not exists messaging_service_sid text,
add column if not exists phone_setup_notes text;

alter table public.businesses
drop constraint if exists businesses_phone_setup_mode_check;

alter table public.businesses
add constraint businesses_phone_setup_mode_check
check (phone_setup_mode in ('twilio_number', 'call_forwarding', 'port_existing', 'sms_transition'));

alter table public.businesses
drop constraint if exists businesses_voice_setup_status_check;

alter table public.businesses
add constraint businesses_voice_setup_status_check
check (voice_setup_status in ('not_started', 'pending', 'active', 'blocked'));

alter table public.businesses
drop constraint if exists businesses_sms_setup_status_check;

alter table public.businesses
add constraint businesses_sms_setup_status_check
check (sms_setup_status in ('not_started', 'pending', 'active', 'transition', 'blocked'));
