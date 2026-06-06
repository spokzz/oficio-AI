alter table public.manual_billing_accounts
add column if not exists overage_starts_at_minutes integer;

update public.manual_billing_accounts
set overage_starts_at_minutes = greatest(
  included_minutes,
  case
    when lower(plan_name) like '%vip%' then 800
    when lower(plan_name) like '%basic%' or lower(plan_name) like '%básico%' or lower(plan_name) like '%basico%' then 110
    else 320
  end
)
where overage_starts_at_minutes is null;

update public.manual_billing_accounts
set plan_name = 'Basic'
where lower(plan_name) like '%basic%'
   or lower(plan_name) like '%básico%'
   or lower(plan_name) like '%basico%';

alter table public.manual_billing_accounts
alter column overage_starts_at_minutes set default 320,
alter column overage_starts_at_minutes set not null;

alter table public.manual_billing_accounts
drop constraint if exists manual_billing_accounts_overage_threshold_check;

alter table public.manual_billing_accounts
add constraint manual_billing_accounts_overage_threshold_check
check (overage_starts_at_minutes >= included_minutes);
