# Integration Plan

Environment separation is required for every integration. Before configuring webhooks or API keys, set `OFICIO_ENV`, `OFICIO_SUPABASE_PROJECT_REF`, provider `*_ENV` labels, and the matching Supabase/Twilio/OpenAI credentials for that environment. See `docs/environment-separation.md`.

## Twilio Voice

Inbound calls should hit a webhook that returns TwiML with `<Connect><Stream>` to the voice gateway. The gateway streams audio between Twilio and OpenAI Realtime.

Implemented webhook routes:

- `POST /api/twilio/voice` - inbound voice routing and known-caller bypass.
- `POST /api/twilio/voice/screen` - one-question unknown caller screening when the realtime gateway is not configured.
- `POST /api/twilio/voice/status` - call completion updates and a fallback source for qualified business minute usage.

Configure each Twilio number voice webhook to `POST /api/twilio/voice`. Configure Twilio call status callbacks to `POST /api/twilio/voice/status`.

The Fly realtime gateway records qualified customer-call usage when a call closes. The Twilio status callback independently records the same source id, and the database unique index makes the operation idempotent. Migration `026_reliable_voice_usage.sql` backfills completed customer calls that were previously missing usage events.

Each business should set:

- `businesses.twilio_routing_phone` - the business-specific Twilio number owners forward calls to.
- `businesses.owner_transfer_phone` or owner `users.phone` - the cellphone used when Ana transfers personal/vendor calls.

If `OFICIO_VOICE_STREAM_URL` is set, business/customer and unknown calls are connected to the realtime voice gateway with `businessId`, `callSessionId`, `fromPhone`, and `toPhone` stream parameters. Without it, known customer calls get a placeholder response and unknown callers use the basic Twilio speech screening fallback.

## OpenAI Realtime

Implemented gateway:

- `npm run voice:realtime` starts `scripts/voice-realtime-server.mjs`.
- Twilio Media Streams connect to `ws(s)://YOUR_GATEWAY/twilio/voice`.
- The gateway bridges Twilio PCMU audio to OpenAI Realtime with `OPENAI_REALTIME_MODEL` defaulting to `gpt-realtime-mini`.
- Ana can check open slots, book confirmed jobs in `jobs`, create/update phone customers, and transfer live calls to the owner through Twilio.
- After collecting the basic service, confirmed address, and scheduling details, Ana asks one final property-access question covering pets, gates or gate codes, parking, unit/building instructions, and other arrival concerns. The response is saved in the job's AI notes and included in owner summaries.

Required voice gateway environment:

- `OPENAI_API_KEY`
- `OPENAI_REALTIME_MODEL=gpt-realtime-mini`
- `OPENAI_REALTIME_VOICE=marin`
- `OFICIO_VOICE_STREAM_URL=wss://YOUR_GATEWAY/twilio/voice`
- `OFICIO_VOICE_GATEWAY_PORT=8787` for the local gateway process
- `OFICIO_MAX_CONCURRENT_AI_CALLS_PER_BUSINESS` optional override; defaults are Basic 1, Premium/Growth 2, VIP 5
- `OFICIO_IDLE_NO_AUDIO_TIMEOUT_MS` optional override; defaults to 15000
- `OFICIO_MAX_REALTIME_CALL_DURATION_MS` optional override; defaults to 900000
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_PHONE` for owner SMS summaries
- `RESEND_API_KEY` and `OFICIO_SUMMARY_FROM_EMAIL` for owner email summaries

The voice gateway should continue to evolve to:

- Add service radius/geocoding checks before confirming out-of-area bookings.
- Create owner-reviewed quote drafts from richer service intake.

## Twilio SMS/MMS

Incoming messages should hit a messaging webhook. Store the message, run the AI text handler, and respond with TwiML `<Message>` when a reply is needed.

Implemented owner confirmation routes:

- `POST /api/twilio/sms` - receives owner `YES`, `ALT`, `CALL`, or `NO` replies for appointment requests.
- `POST /api/twilio/sms` - receives owner YES/NO replies after Ana transfers a personal-screened caller.
- `POST /api/twilio/sms` - logs owner-forwarded old-number customer texts when the owner sends `FWD +1CUSTOMERNUMBER` followed by the message body.
- `POST /api/twilio/sms` - provides the bilingual SMS-only owner assistant for usage, bookings, calls, leads, reminders, customers, and confirmed record changes.
- `POST /api/twilio/owner-confirmations/due` - cron/worker endpoint that sends due owner confirmation texts.

The owner assistant authorizes only an `owner` membership whose saved `users.phone` exactly matches the normalized incoming SMS number. `businesses.owner_transfer_phone` alone does not grant data access. Every data query is scoped to the Twilio number's business. Updates, deletes, booking cancellations, and customer messages use an expiring confirmation stored in `owner_sms_pending_actions`; owner-assistant messages are recorded separately in `owner_sms_history`.

This feature uses regular Twilio SMS only. WhatsApp senders and WhatsApp webhook behavior are not implemented.

When an unknown caller says the call is not about business, Ana transfers the call to the owner and inserts an owner confirmation due two minutes later. Run the due endpoint every minute with `Authorization: Bearer $OFICIO_CRON_SECRET` in production.

Appointment requests remain unconfirmed until the owner responds:

- `YES` confirms the booking and texts the customer.
- `ALT` marks the request as needing rescheduling and asks the customer for another day or time.
- `CALL` marks the request as needing a callback and tells the customer the owner will call.
- `NO` keeps the request as an unconfirmed lead and sends a polite customer update.

New appointment requests use `pending_owner_approval`. The resulting job states are `confirmed`, `needs_reschedule`, `needs_callback`, or `lead_not_confirmed`.

For existing businesses that cannot move SMS immediately, use SMS transition mode. The owner can manually forward a customer text from the old number to the Twilio number in this format:

```text
FWD +13125551234
Customer message text goes here.
```

Ana logs the message against that customer phone number and replies to the owner with a short summary. This does not read the owner's personal inbox automatically; it only processes texts the owner deliberately forwards to the Twilio number.

Required SMS environment:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_PHONE`
- `OPENAI_API_KEY`
- `OPENAI_OWNER_SMS_MODEL` optional, defaults to `OPENAI_TRANSLATION_MODEL` and then `gpt-5-nano`
- `OFICIO_CRON_SECRET` for the due-confirmation worker in production
- `TWILIO_WEBHOOK_BASE_URL` when Twilio signature validation needs a public URL different from the runtime request URL

## Daily Owner Agenda

`GET /api/customer-reminders/due` now performs two jobs:

- Generates recurring customer reminders.
- Sends each owner one bilingual SMS agenda when their business timezone reaches the configured morning hour.

The agenda includes today's pending, confirmed, and in-progress bookings plus all due recurring reminders. It uses `businesses.owner_summary_language`, sends only to phone numbers saved on owner `users.phone` profiles, and records each delivery in `owner_daily_agenda_deliveries`. A unique business/owner/date constraint prevents duplicate morning texts.

On Vercel Hobby, use:

```bash
OWNER_DAILY_AGENDA_DISPATCH_MODE=daily
OWNER_DAILY_AGENDA_HOUR=5
```

The checked-in Hobby cron runs once daily at `10:00 UTC`. That is `5:00 AM` in Chicago during daylight-saving time and `4:00 AM` during standard time. All businesses are processed during that single invocation.

After upgrading to Vercel Pro, change the cron schedule to `0 * * * *` and set:

```bash
OWNER_DAILY_AGENDA_DISPATCH_MODE=hourly
OWNER_DAILY_AGENDA_HOUR=5
```

Hourly mode sends at 5:00 AM in each business's `booking_time_zone` and handles daylight-saving changes correctly.

Set `OWNER_DASHBOARD_URL` separately in each environment:

```bash
OWNER_DASHBOARD_URL=https://staging.theoficio.com/owner
```

Use `https://theoficio.com/owner` in production. The link is always included at the bottom of normal/no-job agendas and in the overflow line when more than five jobs are scheduled.

The SMS uses the owner summary language and follows these compact rules:

- Show scheduled time, customer name, and service only.
- Do not include addresses or notes in job lines.
- Show at most five jobs ordered by scheduled time.
- Count new leads created since the previous local agenda window.
- Summarize at most three actionable attention items.

Vercel Hobby allows cron jobs only once per day. Exact per-business local-time delivery requires Vercel Pro/Enterprise or an external hourly scheduler that calls the protected endpoint with `Authorization: Bearer $CRON_SECRET`. Vercel cron schedules always use UTC.

Photo intake:

- Save Twilio media URLs to storage.
- Analyze images for rough condition signals.
- Attach images and AI observations to quote drafts.

## Supabase

Use Supabase Auth for owner login. Enable Row Level Security on all exposed tables.

Basic policy:

- Owner can read/write data where `business_id` belongs to their authenticated user.
- Admin service role handles onboarding, billing sync, and support tasks.

## Billing V1

Do not integrate Stripe in v1.

Track billing manually in the admin app:

- Basic: `$79/month`, `100` included AI minutes, with `$0.49/minute` overage beginning after `110` total minutes
- Premium: `$149/month`, `300` included AI minutes, with `$0.39/minute` overage beginning after `320` total minutes
- VIP: `$249/month`, `750` included AI minutes, with `$0.29/minute` overage beginning after `800` total minutes
- Plan terms can be customized per business in Admin.
- Each business chooses what happens when the overage threshold is reached: continue with overage, record voicemail, or forward to the owner.
- Onboarding: `$199` one-time
- SMS overage: `$0.04/segment`
- Payment status: trial, active, past due, canceled
- Payment method note: Zelle, ACH, check, external card invoice, or QuickBooks

Stripe can be added later after the offer, churn, usage, and onboarding process are validated.
