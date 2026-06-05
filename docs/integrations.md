# Integration Plan

Environment separation is required for every integration. Before configuring webhooks or API keys, set `OFICIO_ENV`, `OFICIO_SUPABASE_PROJECT_REF`, provider `*_ENV` labels, and the matching Supabase/Twilio/OpenAI credentials for that environment. See `docs/environment-separation.md`.

## Twilio Voice

Inbound calls should hit a webhook that returns TwiML with `<Connect><Stream>` to the voice gateway. The gateway streams audio between Twilio and OpenAI Realtime.

Implemented webhook routes:

- `POST /api/twilio/voice` - inbound voice routing and known-caller bypass.
- `POST /api/twilio/voice/screen` - one-question unknown caller screening when the realtime gateway is not configured.
- `POST /api/twilio/voice/status` - call completion updates and qualified business minute usage.

Configure each Twilio number voice webhook to `POST /api/twilio/voice`. Configure Twilio call status callbacks to `POST /api/twilio/voice/status`.

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

- `POST /api/twilio/sms` - receives owner YES/NO replies after Ana transfers a personal-screened caller.
- `POST /api/twilio/sms` - logs owner-forwarded old-number customer texts when the owner sends `FWD +1CUSTOMERNUMBER` followed by the message body.
- `POST /api/twilio/owner-confirmations/due` - cron/worker endpoint that sends due owner confirmation texts.

When an unknown caller says the call is not about business, Ana transfers the call to the owner and inserts an owner confirmation due two minutes later. Run the due endpoint every minute with `Authorization: Bearer $OFICIO_CRON_SECRET` in production.

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
- `OFICIO_CRON_SECRET` for the due-confirmation worker in production
- `TWILIO_WEBHOOK_BASE_URL` when Twilio signature validation needs a public URL different from the runtime request URL

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

- Growth Monthly: `$149/month`
- Onboarding: `$199` one-time
- Voice overage: `$0.60/min`
- SMS overage: `$0.04/segment`
- Payment status: trial, active, past due, canceled
- Payment method note: Zelle, ACH, check, external card invoice, or QuickBooks

Stripe can be added later after the offer, churn, usage, and onboarding process are validated.
