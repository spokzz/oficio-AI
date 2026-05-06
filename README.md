# Oficio AI

AI receptionist and bilingual job dashboard for U.S. home-service businesses.

Oficio AI helps Spanish-speaking business owners answer calls and texts in the customer's language, collect job details, request photos, draft quotes, and manage bookings from a Spanish-first dashboard.

## Apps

- `app/owner` - protected owner dashboard
- `app/owner/login` - owner email/password login
- `app/admin` - protected internal admin console
- `app/admin/login` - admin email/password login
- `lib` - Supabase clients, server data loaders, types, and formatting helpers
- `components` - reusable portal, auth, owner, and admin UI
- `supabase` - schema migration and optional seed SQL
- `shared` - legacy business-logic fixtures used by `npm test`

## Run Locally

Requirements:

- Node.js `20.19.0+`
- Supabase project with `supabase/migrations/001_initial_schema.sql` already run

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

For local call/SMS testing, also fill in the Twilio values in `.env.local` and expose the voice gateway with a public tunnel:

```bash
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_MESSAGING_SERVICE_SID=your_twilio_messaging_service_sid
TWILIO_FROM_PHONE=+15555555555
TWILIO_WEBHOOK_BASE_URL=https://your-public-tunnel-url
OFICIO_VOICE_STREAM_URL=wss://your-public-tunnel-url/twilio/voice
OFICIO_NEXT_APP_ORIGIN=http://localhost:3000
OFICIO_CRON_SECRET=replace-with-a-long-random-secret
```

Start both the Next.js app and the realtime voice gateway:

```bash
npm run dev
npm run voice:realtime
ngrok http 8787
```

The gateway serves `wss://.../twilio/voice` directly and proxies `/api/twilio/*` HTTP webhooks to the Next.js app. Configure Twilio webhooks with these local URLs:

```text
Voice webhook: https://your-public-tunnel-url/api/twilio/voice
Voice status callback: https://your-public-tunnel-url/api/twilio/voice/status
SMS webhook: https://your-public-tunnel-url/api/twilio/sms
```

Open:

- Owner login: `http://localhost:3000/owner/login`
- Owner app: `http://localhost:3000/owner`
- Admin login: `http://localhost:3000/admin/login`
- Admin app: `http://localhost:3000/admin`

## Test

```bash
npm test
```

This validates the legacy quote estimator, service-radius logic, and pricing/margin model.

## Supabase

After creating a Supabase project, run:

- `supabase/migrations/001_initial_schema.sql`

Then follow:

- `docs/supabase-setup.md`

## Production Integration Targets

The Next.js app now reads core dashboard data from Supabase through authenticated server-side queries and RLS. Remaining production integrations:

- Supabase Auth/Postgres/RLS for accounts, owners, customers, jobs, and settings
- Twilio Voice Media Streams for inbound AI calls
- Twilio Messaging for SMS/MMS and photo intake
- OpenAI Realtime API for multilingual voice conversations
- OpenAI vision-capable model for photo-assisted draft quotes
- Manual billing tracking for v1; Stripe can be added later if needed
- Google Maps or Mapbox for geocoding and service-radius checks

## Brand

Logo files:

- `public/brand/oficio-ai-logo.svg`
- `public/brand/oficio-ai-mark.svg`

Palette:

- Verde profundo: `#173F35`
- Verde accion: `#2F7A55`
- Oro calido: `#F6C85F`
- Crema: `#F7F5EF`
- Texto: `#1E2420`
- Texto secundario: `#6B6256`
- Azul info: `#3D6F91`
- Rojo alerta: `#B84A3A`
