# Supabase Setup Guide

Use this guide after creating your Supabase account and project.

Do not paste database passwords, service role keys, or API secrets into chat. Use the SQL Editor or environment variables.

## 1. Create The Supabase Project

1. Go to Supabase Dashboard.
2. Create a new project.
3. Save these values for later:
   - Project URL
   - anon public key
   - service role key
   - database password

Only the Project URL and anon key can go in browser/frontend code. The service role key must only be used on the backend.

## 2. Run The Database Migration

Fastest path:

1. Open Supabase Dashboard.
2. Go to SQL Editor.
3. Open `supabase/migrations/001_initial_schema.sql`.
4. Copy the full SQL.
5. Paste into SQL Editor.
6. Click Run.

This creates:

- `users`
- `businesses`
- `business_users`
- `service_radius_rules`
- `customers`
- `jobs`
- `quotes`
- `messages`
- `call_sessions`
- `ai_summaries`
- `usage_events`
- `manual_billing_accounts`
- Row Level Security policies
- indexes
- auth user profile trigger

## 3. Configure Auth

In Supabase Dashboard:

1. Go to Authentication > Providers.
2. Enable Email provider.
3. For local testing, you can allow email/password signup.
4. For production, decide whether owners can self-sign up or only be invited.
5. Add Site URL:
   - local: `http://localhost:3000`
   - production: your future domain
6. Add Redirect URLs:
   - `http://localhost:3000/owner`
   - `http://localhost:3000/admin`
   - your production owner/admin URLs later

## 4. Create Your Internal Admin Login

1. Go to Authentication > Users.
2. Click Add user.
3. Create your own admin user.
4. Copy the new Auth user UUID.
5. Go to SQL Editor and run:

```sql
update public.users
set role = 'platform_admin', full_name = 'Your Name'
where id = 'PASTE_YOUR_AUTH_USER_ID';
```

Now this user can use the internal Admin app once the frontend is connected.

## 5. Create The First Owner Login

1. Go to Authentication > Users.
2. Add the owner user, for example Miguel.
3. Copy the owner Auth user UUID.
4. Create the business and membership:

```sql
with new_business as (
  insert into public.businesses (
    name,
    trade,
    status,
    phone,
    base_address,
    owner_summary_language
  )
  values (
    'Green Valley Landscaping',
    'landscaping',
    'onboarding',
    '+13125550101',
    '2148 W Cermak Rd, Chicago, IL',
    'es'
  )
  returning id
)
insert into public.business_users (business_id, user_id, role)
select id, 'PASTE_OWNER_AUTH_USER_ID', 'owner'
from new_business;
```

5. Create the default radius rule:

```sql
insert into public.service_radius_rules (
  business_id,
  radius_miles,
  allow_outside_radius,
  require_owner_approval_outside_radius
)
select id, 30, false, true
from public.businesses
where name = 'Green Valley Landscaping';
```

6. Create manual billing:

```sql
insert into public.manual_billing_accounts (
  business_id,
  plan_name,
  monthly_price,
  onboarding_fee,
  billing_status
)
select id, 'Growth', 149, 199, 'trial'
from public.businesses
where name = 'Green Valley Landscaping';
```

## 6. Test Row Level Security

After connecting the app to Supabase:

- Owner should only see their own business.
- Owner should not see another business's customers/jobs/quotes.
- Platform admin should see all businesses.
- Anonymous users should see nothing.

Supabase's RLS docs say exposed public-schema tables should have RLS enabled. This migration enables RLS on every app table.

## 7. Add Environment Variables Later

When we connect the app code, add:

```bash
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=server_only_service_role_key
```

For browser frameworks like Next.js, public browser variables usually need a public prefix, for example:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

## 8. CLI Option Later

Supabase also supports migrations through the CLI. The official docs recommend local development with the CLI and migrations, but the CLI requires Node.js 20+ when run through `npx`. Since this prototype currently runs on Node 18, the SQL Editor path is simpler for now.
