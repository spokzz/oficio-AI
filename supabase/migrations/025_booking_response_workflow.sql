alter type public.job_status add value if not exists 'pending_owner_approval';
alter type public.job_status add value if not exists 'needs_reschedule';
alter type public.job_status add value if not exists 'needs_callback';
alter type public.job_status add value if not exists 'lead_not_confirmed';

alter table public.owner_booking_confirmations
add column if not exists customer_alt_body text,
add column if not exists customer_call_body text,
add column if not exists customer_decline_body text,
add column if not exists customer_language text;

alter table public.owner_booking_confirmations
drop constraint if exists owner_booking_confirmations_status_check;

alter table public.owner_booking_confirmations
add constraint owner_booking_confirmations_status_check
check (
  status in (
    'pending',
    'sent',
    'approved',
    'declined',
    'reschedule_requested',
    'callback_requested',
    'failed',
    'canceled'
  )
);

alter table public.owner_booking_confirmations
drop constraint if exists owner_booking_confirmations_owner_response_check;

alter table public.owner_booking_confirmations
add constraint owner_booking_confirmations_owner_response_check
check (
  owner_response is null
  or owner_response in ('yes_approve', 'alt_reschedule', 'call_callback', 'no_decline')
);

alter table public.owner_booking_confirmations
drop constraint if exists owner_booking_confirmations_customer_language_check;

alter table public.owner_booking_confirmations
add constraint owner_booking_confirmations_customer_language_check
check (customer_language is null or customer_language in ('en', 'es'));
