# Integration Plan

## Twilio Voice

Inbound calls should hit a webhook that returns TwiML with `<Connect><Stream>` to the voice gateway. The gateway streams audio between Twilio and OpenAI Realtime.

## OpenAI Realtime

The voice gateway should:

- Create one realtime session per call.
- Set `Ana` style instructions.
- Pass business settings as session context.
- Use tool calls for availability, service radius, quote draft, and booking creation.
- Persist transcript, detected language, call outcome, and Spanish owner summary.

## Twilio SMS/MMS

Incoming messages should hit a messaging webhook. Store the message, run the AI text handler, and respond with TwiML `<Message>` when a reply is needed.

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
