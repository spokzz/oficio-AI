# Integration Plan

## Twilio Voice

Inbound calls should hit a webhook that returns TwiML with `<Connect><Stream>` to the voice gateway. The gateway streams audio between Twilio and OpenAI Realtime.

Implemented webhook routes:

- `POST /api/twilio/voice` - inbound voice routing and known-caller bypass.
- `POST /api/twilio/voice/screen` - one-question unknown caller screening.
- `POST /api/twilio/voice/status` - call completion updates and qualified business minute usage.

Configure each Twilio number voice webhook to `POST /api/twilio/voice`. Configure Twilio call status callbacks to `POST /api/twilio/voice/status`.

Each business should set:

- `businesses.twilio_routing_phone` - the business-specific Twilio number owners forward calls to.
- `businesses.owner_transfer_phone` or owner `users.phone` - the cellphone used when Ana transfers personal/vendor calls.

If `OFICIO_VOICE_STREAM_URL` is set, business/customer calls are connected to the realtime voice gateway with `businessId` and `callSessionId` stream parameters. Without it, the webhook records the call and returns a placeholder TwiML response.

## OpenAI Realtime

The voice gateway should:

- Create one realtime session per call.
- Set `Ana` style instructions.
- Pass business settings as session context.
- Use tool calls for availability, service radius, quote draft, and booking creation.
- Persist transcript, detected language, call outcome, and Spanish owner summary.

## Twilio SMS/MMS

Incoming messages should hit a messaging webhook. Store the message, run the AI text handler, and respond with TwiML `<Message>` when a reply is needed.

Implemented owner confirmation routes:

- `POST /api/twilio/sms` - receives owner YES/NO replies after Ana transfers a personal-screened caller.
- `POST /api/twilio/owner-confirmations/due` - cron/worker endpoint that sends due owner confirmation texts.

When an unknown caller says the call is not about business, Ana transfers the call to the owner and inserts an owner confirmation due two minutes later. Run the due endpoint every minute with `Authorization: Bearer $OFICIO_CRON_SECRET` in production.

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
