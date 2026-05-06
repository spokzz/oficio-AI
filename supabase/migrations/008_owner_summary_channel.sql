alter table public.businesses
add column if not exists owner_summary_channel text not null default 'sms';

alter table public.businesses
drop constraint if exists businesses_owner_summary_channel_check;

alter table public.businesses
add constraint businesses_owner_summary_channel_check
check (owner_summary_channel in ('sms', 'email'));
