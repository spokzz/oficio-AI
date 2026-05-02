alter table public.businesses
add column if not exists existing_number_kind text not null default 'unknown',
add column if not exists porting_status text not null default 'not_started',
add column if not exists phone_setup_owner_approved boolean not null default false;

alter table public.businesses
drop constraint if exists businesses_existing_number_kind_check;

alter table public.businesses
add constraint businesses_existing_number_kind_check
check (existing_number_kind in ('unknown', 'business', 'personal', 'mixed'));

alter table public.businesses
drop constraint if exists businesses_porting_status_check;

alter table public.businesses
add constraint businesses_porting_status_check
check (porting_status in ('not_started', 'collecting_info', 'submitted', 'completed', 'blocked'));
