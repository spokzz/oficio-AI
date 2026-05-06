alter table public.businesses
add column if not exists booking_time_zone text not null default 'America/Chicago',
add column if not exists business_hours_text text not null default 'Monday through Friday, 8:00 AM to 5:00 PM';
