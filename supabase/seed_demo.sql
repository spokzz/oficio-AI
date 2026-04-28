-- Optional demo seed.
--
-- Before running:
-- 1. Run supabase/migrations/001_initial_schema.sql.
-- 2. Create users in Supabase Dashboard > Authentication > Users.
-- 3. Copy the Auth user UUIDs into the values below.
-- 4. Run this file in Supabase SQL Editor.
--
-- Required for owner dashboard:
-- - auth.users: created through Supabase Authentication UI
-- - public.users: auto-created by the trigger, then updated below
-- - public.businesses
-- - public.business_users: links the Auth user to the business
--
-- Dashboard demo data lives in:
-- - public.customers
-- - public.jobs
-- - public.quotes
-- - public.messages
-- - public.call_sessions
-- - public.ai_summaries
-- - public.service_radius_rules
-- - public.manual_billing_accounts

begin;

-- Optional: make an Auth user a platform admin.
-- update public.users
-- set role = 'platform_admin',
--     full_name = 'Sakar Pokhrel',
--     preferred_language = 'en'
-- where id = 'PASTE_ADMIN_AUTH_USER_ID'::uuid;

-- Required: replace this UUID with the owner user ID from Authentication > Users.

with seed_config as (
  select 'e2dab94d-0274-40be-b337-5d1a0bfae0a7'::uuid as owner_user_id
)
update public.users
set role = 'owner',
    full_name = 'Miguel Hernandez',
    preferred_language = 'es'
from seed_config
where public.users.id = seed_config.owner_user_id;

with seed_config as (
  select 'e2dab94d-0274-40be-b337-5d1a0bfae0a7'::uuid as owner_user_id
),
existing_business as (
  select id
  from public.businesses
  where name = 'Green Valley Landscaping'
  limit 1
),
new_business as (
  insert into public.businesses (
    name,
    trade,
    status,
    phone,
    base_address,
    base_lat,
    base_lng,
    owner_summary_language,
    customer_default_language,
    ai_voice_name
  )
  select
    'Green Valley Landscaping',
    'landscaping',
    'onboarding',
    '+13125550101',
    '2148 W Cermak Rd, Chicago, IL',
    41.8522000,
    -87.6799000,
    'es',
    'auto',
    'Ana'
  where not exists (select 1 from existing_business)
  returning id
),
business as (
  select id from existing_business
  union all
  select id from new_business
  limit 1
),
owner_membership as (
  insert into public.business_users (business_id, user_id, role)
  select business.id, seed_config.owner_user_id, 'owner'
  from business, seed_config
  on conflict (business_id, user_id) do update
  set role = excluded.role
  returning business_id
),
radius as (
  insert into public.service_radius_rules (
    business_id,
    radius_miles,
    allow_outside_radius,
    require_owner_approval_outside_radius,
    extra_travel_fee
  )
  select business.id, 30, false, true, 25
  from business
  where not exists (
    select 1
    from public.service_radius_rules
    where business_id = business.id
  )
  returning business_id
),
billing as (
  insert into public.manual_billing_accounts (
    business_id,
    plan_name,
    monthly_price,
    onboarding_fee,
    onboarding_paid,
    billing_status,
    next_payment_due_at,
    payment_method_note
  )
  select business.id, 'Growth', 149, 199, true, 'trial', current_date + 14, 'Manual invoice demo'
  from business
  on conflict (business_id) do update
  set plan_name = excluded.plan_name,
      monthly_price = excluded.monthly_price,
      billing_status = excluded.billing_status,
      next_payment_due_at = excluded.next_payment_due_at
  returning business_id
),
customer_1 as (
  insert into public.customers (
    business_id,
    full_name,
    phone,
    email,
    preferred_language,
    address,
    referral_source,
    notes
  )
  select
    business.id,
    'Lucia Ramirez',
    '+13125550210',
    'lucia@example.com',
    'es',
    '1820 S Blue Island Ave, Chicago, IL',
    'Google',
    'Prefers Spanish SMS updates.'
  from business
  returning id, business_id
),
customer_2 as (
  insert into public.customers (
    business_id,
    full_name,
    phone,
    email,
    preferred_language,
    address,
    referral_source
  )
  select
    business.id,
    'James Wilson',
    '+13125550320',
    'james@example.com',
    'en',
    '1420 W 18th St, Chicago, IL',
    'Referral'
  from business
  returning id, business_id
),
job_1 as (
  insert into public.jobs (
    business_id,
    customer_id,
    title,
    service_type,
    status,
    scheduled_start,
    scheduled_end,
    address,
    estimated_value,
    final_value,
    ai_notes
  )
  select
    customer_1.business_id,
    customer_1.id,
    'Spring yard cleanup',
    'yard_cleanup',
    'confirmed',
    now() + interval '3 hours',
    now() + interval '5 hours',
    '1820 S Blue Island Ave, Chicago, IL',
    325,
    null,
    'Customer requested leaf pickup and flower bed cleanup.'
  from customer_1
  returning id, business_id, customer_id
),
job_2 as (
  insert into public.jobs (
    business_id,
    customer_id,
    title,
    service_type,
    status,
    scheduled_start,
    scheduled_end,
    address,
    estimated_value,
    final_value
  )
  select
    customer_2.business_id,
    customer_2.id,
    'Weekly lawn service',
    'lawn_mowing',
    'pending',
    now() + interval '1 day',
    now() + interval '1 day 2 hours',
    '1420 W 18th St, Chicago, IL',
    95,
    null
  from customer_2
  returning id, business_id, customer_id
),
quote_1 as (
  insert into public.quotes (
    business_id,
    customer_id,
    job_id,
    status,
    service_type,
    intake_answers,
    ai_observations,
    suggested_low,
    suggested_high,
    owner_price
  )
  select
    job_1.business_id,
    job_1.customer_id,
    job_1.id,
    'needs_owner_approval',
    'yard_cleanup',
    '{"yard_size":"medium","photos_received":true,"debris":"leaves and branches"}'::jsonb,
    'AI detected moderate debris and recommended owner review before sending.',
    275,
    375,
    325
  from job_1
  returning id, business_id, customer_id, job_id
),
quote_2 as (
  insert into public.quotes (
    business_id,
    customer_id,
    job_id,
    status,
    service_type,
    intake_answers,
    ai_observations,
    suggested_low,
    suggested_high
  )
  select
    job_2.business_id,
    job_2.customer_id,
    job_2.id,
    'draft',
    'lawn_mowing',
    '{"frequency":"weekly","gate_access":"yes"}'::jsonb,
    'Customer asked for recurring service pricing.',
    85,
    115
  from job_2
  returning id, business_id, customer_id, job_id
),
message_1 as (
  insert into public.messages (
    business_id,
    customer_id,
    job_id,
    quote_id,
    channel,
    direction,
    from_phone,
    to_phone,
    language,
    body
  )
  select
    quote_1.business_id,
    quote_1.customer_id,
    quote_1.job_id,
    quote_1.id,
    'sms',
    'inbound',
    '+13125550210',
    '+13125550101',
    'es',
    'Hola, quiero limpieza del patio esta semana. Puedo mandar fotos.'
  from quote_1
  returning id, business_id, customer_id
),
message_2 as (
  insert into public.messages (
    business_id,
    customer_id,
    job_id,
    quote_id,
    channel,
    direction,
    from_phone,
    to_phone,
    language,
    body
  )
  select
    quote_2.business_id,
    quote_2.customer_id,
    quote_2.job_id,
    quote_2.id,
    'sms',
    'outbound',
    '+13125550101',
    '+13125550320',
    'en',
    'Thanks, James. Ana is preparing a weekly lawn service quote for owner review.'
  from quote_2
  returning id, business_id, customer_id
),
call_1 as (
  insert into public.call_sessions (
    business_id,
    customer_id,
    job_id,
    provider_call_id,
    from_phone,
    to_phone,
    detected_language,
    status,
    started_at,
    ended_at,
    transcript,
    outcome
  )
  select
    job_1.business_id,
    job_1.customer_id,
    job_1.id,
    'demo-call-001',
    '+13125550210',
    '+13125550101',
    'es',
    'completed',
    now() - interval '2 hours',
    now() - interval '1 hour 56 minutes',
    'Cliente pidió limpieza del patio, confirmó dirección y mandará fotos.',
    'booked quote review'
  from job_1
  returning id, business_id, customer_id
)
insert into public.ai_summaries (
  business_id,
  call_session_id,
  customer_id,
  summary_language,
  summary,
  action_needed,
  confidence
)
select
  call_1.business_id,
  call_1.id,
  call_1.customer_id,
  'es',
  'Lucia quiere limpieza del patio esta semana. Está dentro del radio de servicio y pidió cotización.',
  'Owner should approve or edit the quote.',
  0.9400
from call_1;

commit;
