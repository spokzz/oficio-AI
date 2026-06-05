# Environment Separation

Use three isolated environments:

- `local`
- `staging`
- `production`

Each environment must have its own Supabase project, Twilio credentials/numbers, OpenAI key, and webhook URLs. Do not point staging Twilio webhooks at a deployment that uses production Supabase.

## Required Labels

Set these in every environment:

```bash
OFICIO_ENV=local # local, staging, or production
OFICIO_SUPABASE_PROJECT_REF=current-project-ref
OFICIO_PRODUCTION_SUPABASE_PROJECT_REF=production-project-ref
OPENAI_KEY_ENV=local # local, staging, or production
TWILIO_ENV=local
GEOCODIO_KEY_ENV=local
RESEND_KEY_ENV=local
```

The app fails fast when:

- `NEXT_PUBLIC_SUPABASE_URL` does not match `OFICIO_SUPABASE_PROJECT_REF`.
- `OFICIO_ENV` is not `production` but the Supabase URL points at `OFICIO_PRODUCTION_SUPABASE_PROJECT_REF`.
- local/staging is configured with provider credentials labeled `production` without an explicit override.

## Protected Secrets

Keep these server-only:

- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_AUTH_TOKEN`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `GEOCODIO_API_KEY`
- `CRON_SECRET`
- `OFICIO_CRON_SECRET`
- `INTERNAL_WEBHOOK_SECRET`
- `CSRF_SECRET`

Never put these in:

- Ana realtime/session instructions
- owner/admin dashboard-rendered config
- customer-visible SMS/email templates
- logs
- `NEXT_PUBLIC_*` variables

## Escape Hatches

These are intentionally noisy and should normally stay `false`:

```bash
OFICIO_ALLOW_PRODUCTION_SUPABASE_IN_NONPROD=false
OFICIO_ALLOW_PRODUCTION_PROVIDER_SECRETS_IN_STAGING=false
OFICIO_ALLOW_PRODUCTION_OPENAI_LOCAL=false
OFICIO_ALLOW_PRODUCTION_TWILIO_LOCAL=false
OFICIO_ALLOW_PRODUCTION_GEOCODIO_LOCAL=false
OFICIO_ALLOW_PRODUCTION_RESEND_LOCAL=false
```

Use them only for a deliberate, temporary test, then remove them.
