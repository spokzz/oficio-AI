alter table public.manual_billing_accounts
add column if not exists included_minutes integer,
add column if not exists overage_rate_per_minute numeric(10, 2);

update public.manual_billing_accounts
set
  included_minutes = case
    when lower(plan_name) like '%vip%' then 750
    when lower(plan_name) like '%basic%' or lower(plan_name) like '%básico%' or lower(plan_name) like '%basico%' then 100
    else 300
  end,
  overage_rate_per_minute = case
    when lower(plan_name) like '%vip%' then 0.29
    when lower(plan_name) like '%basic%' or lower(plan_name) like '%básico%' or lower(plan_name) like '%basico%' then 0.49
    else 0.39
  end
where included_minutes is null
   or overage_rate_per_minute is null;

alter table public.manual_billing_accounts
alter column included_minutes set default 300,
alter column included_minutes set not null,
alter column overage_rate_per_minute set default 0.39,
alter column overage_rate_per_minute set not null;

alter table public.manual_billing_accounts
drop constraint if exists manual_billing_accounts_included_minutes_check;

alter table public.manual_billing_accounts
add constraint manual_billing_accounts_included_minutes_check
check (included_minutes >= 0);

alter table public.manual_billing_accounts
drop constraint if exists manual_billing_accounts_overage_rate_check;

alter table public.manual_billing_accounts
add constraint manual_billing_accounts_overage_rate_check
check (overage_rate_per_minute >= 0);
