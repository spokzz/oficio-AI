# Oficio AI Production Readiness Checklist

This project is a working local prototype. To make it production ready, replace mock data with real services, add authentication, harden the AI workflows, and deploy the owner/admin apps behind secure infrastructure.

## Phase 1: Product Scope Lock

- Keep the first paid product focused on U.S. home-service owners.
- Launch with landscaping first, but keep the data model trade-flexible.
- Keep v1 billing manual with Basic, Premium, and VIP plan defaults plus `$199` onboarding.
- Keep quotes owner-approval-first. Do not allow automatic final quotes yet.
- Define the first supported customer languages: English, Spanish, Hindi, Punjabi, Urdu, Gujarati, Arabic, Mandarin, and Vietnamese.

## Phase 2: Convert Prototype to Production Stack

- Move the UI into Next.js + TypeScript.
- Keep separate routes for owner and admin: `/owner` and `/admin`.
- Replace static mock data with API calls.
- Add shared UI components for cards, tables, forms, status pills, and toasts.
- Add proper form state, validation, loading states, and error states.
- Add a real bilingual dictionary and make every visible string translatable.

## Phase 3: Database and Auth

- Create Supabase project.
- Add Supabase Auth for owner login.
- Add admin-only auth for Oficio AI staff.
- Enable Row Level Security before any customer data goes live.
- Create production tables:
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
  - `usage_events`
  - `billing_accounts`
- Add audit fields: `created_at`, `updated_at`, `created_by`, `business_id`.

## Phase 4: AI Calls

- Buy or connect a Twilio phone number.
- For existing customer numbers, start with call forwarding.
- Build the voice gateway for Twilio Media Streams and OpenAI Realtime.
- Store call transcript, detected language, call outcome, and Spanish owner summary.
- Add call fallbacks:
  - transfer to owner
  - take voicemail-style message
  - create follow-up task
  - mark urgent
- Add AI disclosure at the start of calls.

## Phase 5: SMS and Photo Intake

- Configure Twilio Messaging webhooks.
- Complete U.S. A2P 10DLC requirements before real customer texting.
- Support inbound SMS/MMS.
- Save customer photos to storage.
- Attach photos to quote drafts.
- Add opt-out handling: STOP, START, HELP.
- Log every outbound message for compliance and support.

## Phase 6: Booking and Radius Engine

- Add business hours.
- Add crew capacity.
- Add blocked dates and holidays.
- Add service duration by job type.
- Add address geocoding.
- Enforce service radius, default `30 miles`.
- Add owner override for outside-radius leads.
- Add calendar views: day, week, month.

## Phase 7: Quote Assistant

- Build trade-specific intake forms:
  - landscaping
  - roofing
  - plumbing
- Use photos and answers to create a draft estimate.
- Require owner approval before sending customer quote.
- Add quote actions:
  - approve
  - edit price
  - request more photos
  - reject
  - call customer
- Track quote status and win rate.

## Phase 8: Admin Console

- Add real onboarding workflow.
- Add account health dashboard.
- Add phone setup status.
- Add AI test-call runner.
- Add usage dashboard for minutes and SMS.
- Add manual billing status:
  - onboarding paid
  - monthly paid
  - next due date
  - payment method note
  - past due
- Add impersonation or support view with strict audit logging.

## Phase 9: Security and Compliance

- Require HTTPS in production.
- Store secrets only in environment variables.
- Never expose OpenAI, Twilio, Supabase service, or Maps keys in the browser.
- Add rate limits to API endpoints.
- Add webhook signature verification for Twilio.
- Add privacy policy and terms.
- Add consent language for AI calls and text messaging.
- Add data deletion/export process.

## Phase 10: Deployment

- Deploy web app to Vercel, Render, Railway, or Fly.io.
- Deploy voice gateway somewhere that supports long-running WebSockets.
- Add production environment variables.
- Add custom domain.
- Add logging and alerting.
- Add database backups.
- Add staging environment before production.

## Phase 11: QA Before First Paid Customer

- Test owner login.
- Test admin onboarding.
- Test English, Spanish, and Hindi calls.
- Test inbound SMS.
- Test photo intake.
- Test service radius.
- Test quote approval.
- Test booking creation.
- Test owner Spanish notification.
- Test customer confirmation text.
- Test after-hours flow.
- Test failed AI/tool-call fallback.
- Test mobile layout on iPhone and Android widths.

## Phase 12: Launch Process

- Onboard 3-5 beta owners manually.
- Record setup time and support issues.
- Review every AI call for the first 2 weeks.
- Keep auto-quote disabled.
- Track:
  - calls handled
  - missed calls recovered
  - bookings created
  - quote win rate
  - owner response time
  - AI failure rate
  - gross margin per account
