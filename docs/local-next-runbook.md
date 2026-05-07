# Local Next.js Runbook

## 1. Confirm Node Version

Next.js requires a newer Node version than the first prototype server.

Run:

```bash
node -v
```

Use Node `18.17+`. Node `20+` is preferred.

If your machine still shows `v18.3.0`, install a newer Node version before continuing.

## 2. Install Dependencies

```bash
npm install
```

## 3. Add Environment Variables

```bash
cp .env.example .env.local
```

Fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Do not put your service role key in browser/client code.

## 4. Make Sure Supabase Has Data

You need:

- one admin auth user
- that admin user set to `public.users.role = 'platform_admin'`
- one owner auth user
- one `businesses` row
- one `business_users` row connecting the owner user to the business
- optional but recommended rows for customers, jobs, quotes, messages, call sessions, summaries, radius, and billing

Follow `docs/supabase-setup.md`.

## 5. Run The App

```bash
npm run dev
```

Open:

- Owner login: `http://localhost:3000/owner/login`
- Admin login: `http://localhost:3000/admin/login`

## 6. Run The Realtime Voice Gateway

For Twilio voice calls, run the WebSocket gateway in a second terminal:

```bash
npm run voice:realtime
```

Expose `http://localhost:8787` through your tunnel. The gateway accepts `wss://.../twilio/voice` directly and proxies `/api/twilio/*` HTTP webhooks to the Next.js app running on port 3000.

```bash
ngrok http 8787
```

Then set:

```bash
TWILIO_WEBHOOK_BASE_URL=https://your-tunnel.example
OFICIO_VOICE_STREAM_URL=wss://your-tunnel.example/twilio/voice
OFICIO_NEXT_APP_ORIGIN=http://localhost:3000
OPENAI_API_KEY=your-openai-key
OPENAI_REALTIME_MODEL=gpt-realtime-mini
OPENAI_REALTIME_VOICE=marin
RESEND_API_KEY=optional-for-email-summaries
OFICIO_SUMMARY_FROM_EMAIL="Ana <ana@yourdomain.com>"
```

Configure the Twilio number with:

```text
Voice webhook: https://your-tunnel.example/api/twilio/voice
Voice status callback: https://your-tunnel.example/api/twilio/voice/status
SMS webhook: https://your-tunnel.example/api/twilio/sms
```

Booking time zone and business-hours text are configured per business in Owner Settings or Admin Phone Setup.

## 7. Test Build

```bash
npm run typecheck
npm run build
```

## 8. Current Production Status

Done:

- Next.js + TypeScript structure
- Supabase Auth login
- owner/admin protected routes
- server-side Supabase data loading
- RLS-compatible queries
- manual billing views
- polished login UI
- owner dashboard
- admin console
- Twilio call/text integrations
- OpenAI realtime voice gateway

Still needed:

- real create/update server actions for bookings, quotes, billing notes, and settings
- photo upload/storage
- geocoding/radius provider integration
- deployment environment setup
