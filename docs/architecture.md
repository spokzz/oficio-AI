# Oficio AI Architecture

## Product Boundary

Oficio AI has two web surfaces:

- Owner app: Spanish-first dashboard for bookings, quote approval, customers, revenue, and growth automations.
- Admin app: internal setup and support console used by Oficio AI during onboarding.

## Production Services

Recommended production architecture:

1. Web apps on Vercel or another static/edge host.
2. API layer in Next.js, Fastify, or serverless functions.
3. Supabase Postgres for business accounts, settings, customers, jobs, call logs, messages, and billing status.
4. Twilio Voice Media Streams for live calls.
5. Twilio Messaging for SMS/MMS intake and customer photo collection.
6. OpenAI Realtime API for multilingual voice.
7. OpenAI vision-capable model for photo analysis and draft quote generation.
8. Manual billing tracking for v1; Stripe can be added later after pricing is validated.
9. Google Maps Platform or Mapbox for geocoding and radius checks.

## Key Tables

- `businesses`
- `business_users`
- `services`
- `service_radius_rules`
- `customers`
- `jobs`
- `quotes`
- `messages`
- `call_sessions`
- `ai_summaries`
- `referral_automations`
- `billing_subscriptions`
- `usage_events`

## AI Guardrails

- Always disclose AI assistant identity.
- Detect and continue in the customer's language.
- Send owner summaries in Spanish by default.
- Check service radius before committing to a booking.
- Request photos for quote-heavy jobs.
- Draft quotes only in v1; owner approval is required before sending final price.
- Transfer or flag uncertain, angry, emergency, or legally sensitive conversations.

## Pricing Guardrails

Launch plans are Basic (`$79/month`), Premium (`$149/month`), and VIP (`$249/month`), plus `$199` onboarding.

Included usage:

- 200 AI voice minutes
- 500 SMS segments
- 1 phone number or forwarding setup

Overage:

- `$0.60/min` after included voice minutes
- `$0.04/SMS segment` after included messages
- `$10/month` extra phone number
