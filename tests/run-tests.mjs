import assert from "node:assert/strict";
import fs from "node:fs";
import { estimateLandscapingQuote, estimateMonthlyGrossMargin, isInsideServiceRadius } from "../shared/domain.js";
import { createActiveVoiceCallRegistry } from "../shared/active-voice-call-registry.js";

const chicago = { lat: 41.8529, lng: -87.6532 };
const nearby = { lat: 41.8781, lng: -87.6298 };
const farAway = { lat: 42.3314, lng: -83.0458 };

const nearResult = isInsideServiceRadius(chicago, nearby, 30);
assert.equal(nearResult.inside, true, "Nearby lead should be inside 30-mile radius");

const farResult = isInsideServiceRadius(chicago, farAway, 30);
assert.equal(farResult.inside, false, "Detroit lead should be outside 30-mile radius");

const quote = estimateLandscapingQuote({
  yardSize: "medium",
  overgrown: true,
  photosCount: 3,
  recurring: false
});
assert.deepEqual(quote, { low: 280, high: 360, recommended: 320 });

const margin = estimateMonthlyGrossMargin({
  monthlyPrice: 149,
  voiceMinutes: 200,
  smsSegments: 500
});
assert.equal(margin.marginPercent > 60, true, "Growth plan should preserve >60% gross margin at included usage");

const ownerDataSource = fs.readFileSync(new URL("../lib/owner-data.ts", import.meta.url), "utf8");
assert.equal(ownerDataSource.includes("tryTranslateOwnerText"), false, "Owner dashboard data loading should not call OpenAI translation");
assert.equal(ownerDataSource.includes("ownerTranslationConfigured"), false, "Owner dashboard data loading should use cached translations only");

function sourceFiles(directoryUrl) {
  return fs.readdirSync(directoryUrl, { withFileTypes: true }).flatMap((entry) => {
    const childUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directoryUrl);
    if (entry.isDirectory()) return sourceFiles(childUrl);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) ? [childUrl] : [];
  });
}

const browserRenderedSource = sourceFiles(new URL("../app/", import.meta.url))
  .concat(sourceFiles(new URL("../components/", import.meta.url)))
  .map((fileUrl) => fs.readFileSync(fileUrl, "utf8"))
  .join("\n");
const adminDashboardSource = fs.readFileSync(new URL("../components/admin/admin-dashboard.tsx", import.meta.url), "utf8");
const ownerDashboardSource = fs.readFileSync(new URL("../components/owner/owner-dashboard.tsx", import.meta.url), "utf8");
const accountHealthSource = adminDashboardSource.slice(
  adminDashboardSource.indexOf("function AccountTable"),
  adminDashboardSource.indexOf("function accountLaunchChecks")
);
const addressLookupSource = fs.readFileSync(new URL("../components/ui/address-lookup-input.tsx", import.meta.url), "utf8");
const adminDataSource = fs.readFileSync(new URL("../lib/admin-data.ts", import.meta.url), "utf8");
const callRoutingSource = fs.readFileSync(new URL("../lib/call-routing.ts", import.meta.url), "utf8");
const callUsageSource = fs.readFileSync(new URL("../lib/call-usage.ts", import.meta.url), "utf8");
const loginCardSource = fs.readFileSync(new URL("../components/auth/login-card.tsx", import.meta.url), "utf8");
const dashboardRenderedSource = sourceFiles(new URL("../components/", import.meta.url))
  .concat([
    new URL("../app/admin/page.tsx", import.meta.url),
    new URL("../app/owner/page.tsx", import.meta.url),
    new URL("../app/owner/no-business/page.tsx", import.meta.url),
    new URL("../app/admin/login/page.tsx", import.meta.url),
    new URL("../app/owner/login/page.tsx", import.meta.url)
  ])
  .map((fileUrl) => fs.readFileSync(fileUrl, "utf8"))
  .join("\n");
for (const unsafeSink of ["dangerouslySetInnerHTML", ".innerHTML", ".outerHTML", "insertAdjacentHTML", "DOMParser", "marked(", "markdown-to-jsx"]) {
  assert.equal(browserRenderedSource.includes(unsafeSink), false, `Dashboard code should render untrusted fields as text, not use ${unsafeSink}`);
}
for (const secretName of [
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWILIO_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "GEOCODIO_API_KEY",
  "CRON_SECRET",
  "INTERNAL_WEBHOOK_SECRET"
]) {
  assert.equal(dashboardRenderedSource.includes(secretName), false, `Dashboard-rendered code should not reference protected secret ${secretName}`);
}

const gitignoreSource = fs.readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
assert.equal(gitignoreSource.includes(".env*"), true, "All concrete env files should be gitignored");
assert.equal(gitignoreSource.includes("!.env.example"), true, ".env.example should remain the only tracked env template");

const environmentSource = fs.readFileSync(new URL("../lib/environment.ts", import.meta.url), "utf8");
assert.equal(environmentSource.includes("assertSupabaseEnvironmentSafety"), true, "Environment guard should validate Supabase project separation");
assert.equal(environmentSource.includes("assertProviderEnvironmentSafety"), true, "Environment guard should validate provider secret labels");
assert.equal(environmentSource.includes("assertNoProtectedSecrets"), true, "Environment guard should block protected secrets in prompts/config text");

const supabaseAdminSource = fs.readFileSync(new URL("../lib/supabase/admin.ts", import.meta.url), "utf8");
assert.equal(supabaseAdminSource.includes("assertSupabaseEnvironmentSafety"), true, "Supabase admin client should enforce environment separation");

const envExampleSource = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
for (const envName of ["OFICIO_ENV", "OFICIO_SUPABASE_PROJECT_REF", "OFICIO_PRODUCTION_SUPABASE_PROJECT_REF", "OPENAI_KEY_ENV", "TWILIO_ENV", "GEOCODIO_KEY_ENV", "RESEND_KEY_ENV", "CSRF_SECRET"]) {
  assert.equal(envExampleSource.includes(envName), true, `.env.example should document ${envName}`);
}

const csrfSource = fs.readFileSync(new URL("../lib/csrf.ts", import.meta.url), "utf8");
assert.equal(csrfSource.includes("createHmac"), true, "CSRF tokens should be signed server-side");
assert.equal(csrfSource.includes("timingSafeEqual"), true, "CSRF signatures should use constant-time comparison");
assert.equal(csrfSource.includes("CSRF_SECRET must be configured in production"), true, "Production CSRF protection should require a server secret");
assert.equal(csrfSource.includes("TWILIO_AUTH_TOKEN || process.env.OPENAI_API_KEY"), false, "CSRF should not reuse protected provider secrets");

const ownerActionsSource = fs.readFileSync(new URL("../app/actions/owner.ts", import.meta.url), "utf8");
const adminActionsSource = fs.readFileSync(new URL("../app/actions/admin.ts", import.meta.url), "utf8");
for (const action of [
  "updateOwnerSettings",
  "updateOwnerServiceArea",
  "addOwnerAvailabilityException",
  "deleteOwnerAvailabilityException",
  "addOwnerBooking",
  "updateOwnerBooking",
  "deleteOwnerBooking",
  "addOwnerCustomer",
  "updateOwnerCustomer",
  "deleteOwnerCustomer"
]) {
  assert.equal(
    new RegExp(`function ${action}[\\s\\S]{0,260}validate(Form|CurrentUser)CsrfToken`).test(ownerActionsSource),
    true,
    `${action} should validate CSRF before owner mutation logic`
  );
}
for (const action of [
  "onboardOwner",
  "updateBusinessPhoneSetup",
  "updateAdminOwnerName",
  "updateAdminAccount",
  "deleteAdminAccount",
  "addAdminAvailabilityException",
  "deleteAdminAvailabilityException"
]) {
  assert.equal(
    new RegExp(`function ${action}[\\s\\S]{0,260}validate(Form|CurrentUser)CsrfToken`).test(adminActionsSource),
    true,
    `${action} should validate CSRF before admin mutation logic`
  );
}
assert.equal(browserRenderedSource.includes('name={CSRF_FIELD_NAME}'), true, "Owner/admin forms should render CSRF token fields");
assert.equal(
  adminDashboardSource.includes('value={formValues.businessName}') &&
    adminDashboardSource.includes('value={formValues.ownerPassword}') &&
    adminDashboardSource.includes('value={formValues.phoneSetupNotes}'),
  true,
  "New owner setup should keep all entered values in controlled client state after an action error"
);
assert.equal(
  addressLookupSource.includes("value: controlledValue") && addressLookupSource.includes("onValueChange?.(nextValue)"),
  true,
  "Address lookup should support controlled onboarding values"
);
assert.equal(
  adminDataSource.includes("accountSidConfigured") &&
    adminDataSource.includes("authTokenConfigured") &&
    !adminDataSource.includes('accountSid: process.env["TWILIO_ACCOUNT_SID"]') &&
    !adminDataSource.includes('authToken: process.env["TWILIO_AUTH_TOKEN"]'),
  true,
  "Admin data should expose Twilio credential status without exposing credential values"
);
assert.equal(
  adminDashboardSource.includes("Twilio platform credentials") &&
    adminDashboardSource.includes("Keep the Auth Token in server environment variables"),
  true,
  "New owner setup should explain that Twilio credentials are platform-level secrets"
);
for (const planDefault of [
  'label: "Basic"',
  "monthlyPrice: 79",
  "allowanceMinutes: 100",
  "overageStartsAtMinutes: 110",
  "overageRatePerMinute: 0.49",
  "monthlyPrice: 149",
  "allowanceMinutes: 300",
  "overageStartsAtMinutes: 320",
  "overageRatePerMinute: 0.39",
  "monthlyPrice: 249",
  "allowanceMinutes: 750",
  "overageStartsAtMinutes: 800",
  "overageRatePerMinute: 0.29"
]) {
  assert.equal(callUsageSource.includes(planDefault), true, `AI call plans should include ${planDefault}`);
}
assert.equal(
  callUsageSource.includes("safeUsedMinutes - selectedOverageThreshold"),
  true,
  "Billable overage minutes should begin after the configured grace threshold"
);
assert.equal(
  callRoutingSource.includes("usage.usedMinutes >= usage.overageStartsAtMinutes"),
  true,
  "Monthly minute-limit routing should begin at the overage threshold"
);
assert.equal(
  adminDashboardSource.includes('name="includedMinutes"') &&
    adminDashboardSource.includes('name="overageStartsAtMinutes"') &&
    adminDashboardSource.includes('name="overageRatePerMinute"') &&
    adminDashboardSource.includes("handlePlanSelect"),
  true,
  "Admin onboarding should preload editable included minutes and overage pricing from the selected plan"
);
assert.equal(
  adminActionsSource.includes("included_minutes: includedMinutes") &&
    adminActionsSource.includes("overage_starts_at_minutes: overageStartsAtMinutes") &&
    adminActionsSource.includes("overage_rate_per_minute: overageRatePerMinute"),
  true,
  "Admin actions should persist customized per-account call plan terms"
);
assert.equal(
  adminDashboardSource.includes("Continue calls and bill overage") &&
    adminDashboardSource.includes("Stop AI calls and take basic voicemail") &&
    adminDashboardSource.includes("Forward calls to owner"),
  true,
  "Admin should configure all monthly minute-limit behaviors"
);
assert.equal(
  !ownerActionsSource.includes('formData.get("minuteLimitPolicy")') &&
    !ownerActionsSource.includes("minute_limit_policy: minuteLimitPolicy") &&
    !ownerDashboardSource.includes('name="minuteLimitPolicy"'),
  true,
  "Only admins should be able to configure monthly minute-limit behavior"
);
assert.equal(
  adminDashboardSource.includes('name="onboardingFee"') &&
    adminDashboardSource.includes("Automatically set to one calendar month after account creation."),
  true,
  "Admin onboarding should allow an editable setup fee and explain the automatic first payment date"
);
assert.equal(
  adminActionsSource.includes("nextMonthlyPaymentDueDate()") &&
    adminActionsSource.includes("next_payment_due_at: nextMonthlyPaymentDueDate()"),
  true,
  "New accounts should receive a next payment date one calendar month after creation"
);
assert.equal(
  !accountHealthSource.includes("<th>Billing</th>") &&
    !accountHealthSource.includes("<th>Action</th>") &&
    !accountHealthSource.includes("<th>Phone setup</th>") &&
    accountHealthSource.includes("<th>Next payment</th>") &&
    accountHealthSource.includes("billing?.next_payment_due_at") &&
    !accountHealthSource.includes("<BusinessNameEditor") &&
    !accountHealthSource.includes("<OwnerList"),
  true,
  "Account Health should render read-only identity and next payment without billing, phone setup, or action columns"
);
assert.equal(
  adminDashboardSource.includes('label="MRR"') &&
    adminDashboardSource.includes('foot="Monthly revenue"') &&
    adminDataSource.includes("sum + Number(account.manual_billing_accounts?.[0]?.monthly_price ?? 0)"),
  true,
  "Dashboard monthly revenue should total each account's current monthly plan price"
);
assert.equal(
  loginCardSource.includes("Run your business from one") &&
    loginCardSource.includes("Ana answers calls, books jobs, and sends every job summary in Spanish or English."),
  true,
  "Admin login should use the same Ana dashboard message as the owner login"
);

const twilioSource = fs.readFileSync(new URL("../lib/twilio.ts", import.meta.url), "utf8");
assert.equal(twilioSource.includes("if (!authToken) return true"), false, "Twilio webhook validation must not allow requests when TWILIO_AUTH_TOKEN is missing");
assert.equal(twilioSource.includes("if (!authToken) return false"), true, "Twilio webhook validation should fail closed when TWILIO_AUTH_TOKEN is missing");
assert.equal(twilioSource.includes("TWILIO_WEBHOOK_BASE_URL"), true, "Twilio signature validation should support the public webhook URL Twilio called");
assert.equal(twilioSource.includes("businessSmsSender"), true, "Twilio SMS should support per-business sender configuration");
assert.equal(twilioSource.includes("messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID"), true, "Business Messaging Service SID should override the global fallback");
assert.equal(twilioSource.includes("fromPhone || process.env.TWILIO_FROM_PHONE"), true, "Business Twilio phone should override the global fallback sender");
assert.equal(twilioSource.includes("payload.from"), true, "SMS sends should return the actual Twilio sender when available");

for (const route of [
  "../app/api/twilio/voice/route.ts",
  "../app/api/twilio/sms/route.ts",
  "../app/api/twilio/voice/status/route.ts",
  "../app/api/twilio/voice/screen/route.ts",
  "../app/api/twilio/voice/voicemail/route.ts"
]) {
  const routeSource = fs.readFileSync(new URL(route, import.meta.url), "utf8");
  assert.equal(routeSource.includes("validateTwilioSignature"), true, `${route} should validate X-Twilio-Signature`);
  assert.equal(routeSource.includes("Invalid Twilio signature"), true, `${route} should reject invalid Twilio signatures before webhook logic`);
}

const twilioVoiceRouteSource = fs.readFileSync(new URL("../app/api/twilio/voice/route.ts", import.meta.url), "utf8");
assert.equal(twilioVoiceRouteSource.includes("activeAiCallCapacityStatus"), true, "Voice webhooks should enforce per-business active AI call limits");
assert.equal(
  twilioVoiceRouteSource.includes('minuteLimitPolicy !== "continue_overage"') &&
    twilioVoiceRouteSource.includes("monthlyLimitVoicemailTwiml") &&
    twilioVoiceRouteSource.includes("transferToOwnerTwiml"),
  true,
  "Voice routing should enforce the configured over-limit behavior before starting Ana"
);
const twilioVoiceStatusSource = fs.readFileSync(new URL("../app/api/twilio/voice/status/route.ts", import.meta.url), "utf8");
assert.equal(
  twilioVoiceStatusSource.includes('!call.screening_result?.startsWith("monthly_limit_")'),
  true,
  "Voicemail and owner-forward calls should not be billed as AI receptionist minutes"
);
assert.equal(
  twilioVoiceStatusSource.includes("timestampDuration") &&
    twilioVoiceStatusSource.includes("Math.max(call.qualified_business_seconds, calculatedQualifiedSeconds)") &&
    twilioVoiceStatusSource.includes('usageError.code !== "23505"'),
  true,
  "Voice status callbacks should recover missing duration and record usage idempotently"
);
assert.equal(Number((247 / 60).toFixed(4)), 4.1167, "A 4:07 qualified call should count as 4.1167 AI minutes");

const phoneSource = fs.readFileSync(new URL("../lib/phone.ts", import.meta.url), "utf8");
assert.equal(phoneSource.includes("phone?.trim()"), false, "Phone search values should not include unsanitized raw input in query builders");

assert.equal(callRoutingSource.includes(".or(filters)"), false, "Call routing should not build raw PostgREST OR filter strings from phone input");
assert.equal(callRoutingSource.includes('.in("twilio_routing_phone", phones)'), true, "Call routing should use fixed-column phone lookups");
assert.equal(callRoutingSource.includes("messaging_service_sid"), true, "Call routing should load per-business Messaging Service SID for outbound SMS");

const twilioSmsRouteSource = fs.readFileSync(new URL("../app/api/twilio/sms/route.ts", import.meta.url), "utf8");
assert.equal(twilioSmsRouteSource.includes("reserveTwilioWebhookEvent(params.MessageSid"), true, "SMS webhooks should dedupe Twilio MessageSid before side effects");
assert.equal(twilioSmsRouteSource.includes("businessSmsSender"), true, "SMS webhooks should send outbound replies from the configured business sender");
assert.equal(
  twilioSmsRouteSource.includes("findAuthorizedSmsOwner") &&
    twilioSmsRouteSource.includes("handleOwnerAssistantSms") &&
    twilioSmsRouteSource.includes("owner_sms_access_denied"),
  true,
  "SMS webhooks should authorize and audit owner-assistant access before exposing business data"
);

const ownerSmsAssistantSource = fs.readFileSync(new URL("../lib/owner-sms-assistant.ts", import.meta.url), "utf8");
assert.equal(ownerSmsAssistantSource.includes('.eq("role", "owner")'), true, "Owner SMS authorization should require an owner membership and owner profile");
assert.equal(ownerSmsAssistantSource.includes("normalizePhone(profile.phone) === phone"), true, "Owner SMS authorization should exactly match the saved normalized owner phone");
assert.equal(ownerSmsAssistantSource.includes("business_id") && ownerSmsAssistantSource.includes(".eq(\"business_id\", businessId)"), true, "Owner SMS data access should remain business-scoped");
assert.equal(ownerSmsAssistantSource.includes("https://api.openai.com/v1/responses"), true, "Owner SMS intent extraction should use the OpenAI Responses API");
assert.equal(ownerSmsAssistantSource.includes('type: "json_schema"') && ownerSmsAssistantSource.includes("strict: true"), true, "Owner SMS intent extraction should use strict structured output");
assert.equal(ownerSmsAssistantSource.includes("owner_sms_pending_actions"), true, "Owner SMS changes should use expiring pending confirmations");
assert.equal(ownerSmsAssistantSource.includes("owner_sms_history"), true, "Owner SMS commands and replies should use separate owner history");
assert.equal(ownerSmsAssistantSource.includes("WhatsApp"), false, "Owner assistant implementation should remain SMS-only");
for (const protectedAction of ["update_customer", "delete_customer", "delete_lead", "delete_booking", "send_customer_message_after_confirmation"]) {
  assert.equal(ownerSmsAssistantSource.includes(protectedAction), true, `Owner SMS should support protected action ${protectedAction}`);
}

const dailyOwnerAgendaSource = fs.readFileSync(new URL("../lib/daily-owner-agenda.ts", import.meta.url), "utf8");
const customerReminderCronSource = fs.readFileSync(new URL("../app/api/customer-reminders/due/route.ts", import.meta.url), "utf8");
const vercelSource = fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
assert.equal(customerReminderCronSource.includes("sendDueOwnerDailyAgendas"), true, "Reminder cron should send the owner daily agenda after generating reminders");
assert.equal(vercelSource.includes('"schedule": "0 10 * * *"'), true, "Hobby deployment should use a supported once-daily UTC agenda schedule");
assert.equal(dailyOwnerAgendaSource.includes("OWNER_DAILY_AGENDA_HOUR ?? 5"), true, "Daily agenda should default to 5 AM local business time");
assert.equal(dailyOwnerAgendaSource.includes('OWNER_DAILY_AGENDA_DISPATCH_MODE ?? "daily"'), true, "Daily agenda should default to Hobby-compatible daily dispatch");
assert.equal(dailyOwnerAgendaSource.includes("booking_time_zone"), true, "Daily agenda should use each business booking timezone");
assert.equal(dailyOwnerAgendaSource.includes('.eq("role", "owner")'), true, "Daily agenda should only load owner memberships");
assert.equal(dailyOwnerAgendaSource.includes("normalizePhone(owner.phone)"), true, "Daily agenda should send only to saved owner profile phones");
assert.equal(dailyOwnerAgendaSource.includes("owner_summary_language"), true, "Daily agenda should use the saved owner summary language");
assert.equal(dailyOwnerAgendaSource.includes("owner_daily_agenda_deliveries"), true, "Daily agenda delivery should be durably deduplicated");
assert.equal(
  dailyOwnerAgendaSource.includes("Good morning. Daily summary for") &&
    dailyOwnerAgendaSource.includes("Buenos días. Resumen diario para") &&
    dailyOwnerAgendaSource.includes("Today’s jobs: none scheduled."),
  true,
  "Daily agenda should have normal and no-job English/Spanish templates"
);
assert.equal(dailyOwnerAgendaSource.includes("Showing first 5:") && dailyOwnerAgendaSource.includes("more jobs in dashboard"), true, "Daily agenda should cap job details at five");
assert.equal(dailyOwnerAgendaSource.includes("OWNER_DASHBOARD_URL"), true, "Daily agenda should always include the environment-specific owner dashboard link");
assert.equal(dailyOwnerAgendaSource.includes("leadWindowStart") && dailyOwnerAgendaSource.includes("leadWindowEnd"), true, "New leads should use the previous local agenda window");
assert.equal(dailyOwnerAgendaSource.includes("missingAddressNames") && dailyOwnerAgendaSource.includes("pendingApprovalCount"), true, "Daily agenda should summarize actionable attention items");
assert.equal(
  dailyOwnerAgendaSource.includes("customers(full_name,phone)") &&
    dailyOwnerAgendaSource.includes("newLeads.slice(0, 3)") &&
    dailyOwnerAgendaSource.includes("Details:"),
  true,
  "Daily agenda should include useful details for each recent lead instead of only a count"
);

const realtimeGatewaySource = fs.readFileSync(new URL("../scripts/voice-realtime-server.mjs", import.meta.url), "utf8");
assert.equal(realtimeGatewaySource.includes("IDLE_NO_AUDIO_TIMEOUT_MS = Number(process.env.OFICIO_IDLE_NO_AUDIO_TIMEOUT_MS || 15 * 1000)"), true, "Realtime gateway should default no-audio timeout to 15 seconds");
assert.equal(realtimeGatewaySource.includes("Missing validated call session id"), true, "Realtime gateway should require a call session created by the Twilio voice webhook");
assert.equal(realtimeGatewaySource.includes("reserve_active_voice_call_lease"), true, "Realtime gateway should reserve a durable slot before opening OpenAI Realtime");
assert.equal(realtimeGatewaySource.includes("createOpenAiSocket"), true, "Realtime gateway should keep using OpenAI Realtime after safety gates pass");
assert.equal(realtimeGatewaySource.includes("PROMPT_INJECTION_PATTERNS"), true, "Realtime tools should screen prompt-injection attempts before backend writes");
assert.equal(realtimeGatewaySource.includes("validateToolArgs"), true, "Realtime tools should validate required fields before backend writes");
assert.equal(realtimeGatewaySource.includes("owner_approval_sent"), true, "Realtime tools should not return internal owner approval records to the model");
assert.equal(realtimeGatewaySource.includes("booking_id: job.id"), false, "Realtime tools should not expose internal booking ids to the model");
assert.equal(realtimeGatewaySource.includes("assertSupabaseEnvironmentSafety"), true, "Realtime gateway should enforce Supabase environment separation");
assert.equal(realtimeGatewaySource.includes("assertProviderEnvironmentSafety"), true, "Realtime gateway should enforce provider environment labels");
assert.equal(realtimeGatewaySource.includes("assertNoProtectedSecrets(instructions"), true, "Realtime gateway should check Ana instructions for protected secrets");
assert.equal(realtimeGatewaySource.includes("businessSmsSender"), true, "Realtime gateway SMS should prefer per-business Twilio sender configuration");
assert.equal(realtimeGatewaySource.includes("messaging_service_sid"), true, "Realtime gateway should load per-business Messaging Service SID");
assert.equal(
  realtimeGatewaySource.includes("Could not notify owner about fallback lead") &&
    realtimeGatewaySource.includes("return { ok: Boolean(sms.ok), sms }") &&
    !realtimeGatewaySource.includes('call.name === "end_call") {\n      state.finalized = true;'),
  true,
  "Completed customer calls should notify the owner through fallback lead processing when Ana did not save a summary"
);
assert.equal(
  realtimeGatewaySource.includes("recordQualifiedVoiceUsage") &&
    realtimeGatewaySource.includes('source: "realtime_gateway"') &&
    realtimeGatewaySource.includes("Could not reload finalized call for usage"),
  true,
  "Fly realtime cleanup should record qualified AI minutes without depending on the Twilio status callback"
);
assert.equal(
  realtimeGatewaySource.includes("ownerPhone: normalizePhone(owner?.phone) || normalizePhone(business.owner_transfer_phone)") &&
    realtimeGatewaySource.includes("ownerTransferPhone: normalizePhone(business.owner_transfer_phone) || normalizePhone(owner?.phone)"),
  true,
  "Owner summaries should use the profile phone while live call transfers use the configured transfer phone"
);
assert.equal(
  realtimeGatewaySource.includes("YES = confirm + text customer") &&
    realtimeGatewaySource.includes("ALT = ask customer for another time") &&
    realtimeGatewaySource.includes("CALL = tell customer owner will call") &&
    realtimeGatewaySource.includes("NO = keep as lead, not confirmed"),
  true,
  "Owner booking approval SMS should present all four customer-safe response options"
);
assert.equal(
  realtimeGatewaySource.includes("That time is not available anymore, but we can still help.") &&
    realtimeGatewaySource.includes("The owner will call you back to confirm the best time") &&
    realtimeGatewaySource.includes("that appointment time is not confirmed") &&
    realtimeGatewaySource.includes("Ese horario ya no está disponible") &&
    realtimeGatewaySource.includes("El dueño le llamará"),
  true,
  "Booking workflow should generate bilingual customer messages for ALT, CALL, and NO"
);
assert.equal(
  realtimeGatewaySource.includes('"customer_language"') &&
    realtimeGatewaySource.includes('status: "pending_owner_approval"') &&
    realtimeGatewaySource.includes("This is not confirmed yet"),
  true,
  "Ana should preserve the caller language and set expectations before owner approval"
);
assert.equal(
  realtimeGatewaySource.includes("property_access_confirmed") &&
    realtimeGatewaySource.includes("property_access_notes") &&
    realtimeGatewaySource.includes("After the basic service, address, and scheduling details are collected") &&
    realtimeGatewaySource.includes("ai_notes: jobAiNotes"),
  true,
  "Ana should ask the late-stage property-access question and save the answer in owner-visible job notes"
);
assert.equal(
  realtimeGatewaySource.includes("pets, a gate or gate code, parking, unit or building instructions") &&
    realtimeGatewaySource.includes("Property access:") &&
    realtimeGatewaySource.includes("Access:"),
  true,
  "Owner summaries and approval messages should surface property access details"
);

const smsRouteSource = fs.readFileSync(new URL("../app/api/twilio/sms/route.ts", import.meta.url), "utf8");
assert.equal(smsRouteSource.includes("validCustomerBookingResponseSms"), true, "Every customer booking-response SMS should be template-validated before sending");
assert.equal(
  smsRouteSource.includes('jobStatus: "confirmed"') &&
    smsRouteSource.includes('jobStatus: "needs_reschedule"') &&
    smsRouteSource.includes('jobStatus: "needs_callback"') &&
    smsRouteSource.includes('jobStatus: "lead_not_confirmed"'),
  true,
  "Owner YES, ALT, CALL, and NO replies should map to explicit booking workflow states"
);
assert.equal(
  smsRouteSource.includes("Ana asked the customer for another day or time.") &&
    smsRouteSource.includes("Ana told the customer you will call") &&
    smsRouteSource.includes("sent the customer a polite update"),
  true,
  "Every non-confirmation owner response should still notify the customer"
);
assert.equal(
  smsRouteSource.includes("fallbackCustomerBookingResponse") &&
    smsRouteSource.includes("confirmation.customer_language || callSession?.detected_language || customer?.preferred_language"),
  true,
  "Older pending booking requests should receive bilingual fallback customer messages"
);

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationSql = fs
  .readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => fs.readFileSync(new URL(file, migrationsDirectory), "utf8"))
  .join("\n");
assert.equal(migrationSql.includes("included_minutes integer"), true, "Billing migrations should store per-account included minutes");
assert.equal(migrationSql.includes("overage_starts_at_minutes integer"), true, "Billing migrations should store each account's overage threshold");
assert.equal(migrationSql.includes("overage_rate_per_minute numeric"), true, "Billing migrations should store per-account overage pricing");
assert.equal(migrationSql.includes("minute_limit_policy text"), true, "Businesses should store a monthly minute-limit behavior");
assert.equal(migrationSql.includes("voicemail_recording_url text"), true, "Call sessions should store voicemail recording metadata");
assert.equal(migrationSql.includes("create table if not exists public.owner_sms_pending_actions"), true, "Owner SMS confirmations should have durable expiring state");
assert.equal(migrationSql.includes("create table if not exists public.owner_sms_history"), true, "Owner SMS history should be stored separately from customer messages");
assert.equal(migrationSql.includes("owner_sms_pending_actions_one_pending_idx"), true, "Each owner should have at most one active owner SMS action");
assert.equal(migrationSql.includes('create policy "members manage owner sms pending actions"'), false, "Authenticated browser clients should not mutate owner SMS confirmations");
assert.equal(migrationSql.includes('create policy "members create owner sms history"'), false, "Authenticated browser clients should not forge owner SMS history");
assert.equal(migrationSql.includes("create table if not exists public.owner_daily_agenda_deliveries"), true, "Daily owner agendas should have a delivery ledger");
assert.equal(migrationSql.includes("unique (business_id, owner_user_id, agenda_date)"), true, "Daily owner agenda delivery should be unique per owner and local date");
assert.equal(migrationSql.includes('create policy "members manage owner daily agenda deliveries"'), false, "Authenticated browser clients should not forge daily agenda deliveries");
for (const status of ["pending_owner_approval", "needs_reschedule", "needs_callback", "lead_not_confirmed"]) {
  assert.equal(migrationSql.includes(`'${status}'`), true, `Booking response workflow should add the ${status} job status`);
}
for (const response of ["yes_approve", "alt_reschedule", "call_callback", "no_decline"]) {
  assert.equal(migrationSql.includes(`'${response}'`), true, `Booking confirmations should accept the ${response} owner response`);
}
for (const column of ["customer_alt_body", "customer_call_body", "customer_decline_body", "customer_language"]) {
  assert.equal(migrationSql.includes(column), true, `Booking confirmations should store ${column}`);
}
assert.equal(
  migrationSql.includes("usage_events_event_type_source_id_idx") &&
    migrationSql.includes("'backfilled', true") &&
    migrationSql.includes("call.qualified_business_seconds::numeric / 60"),
  true,
  "Usage migrations should dedupe and backfill completed qualified calls"
);
for (const table of [
  "businesses",
  "business_users",
  "users",
  "customers",
  "caller_contacts",
  "jobs",
  "quotes",
  "messages",
  "call_sessions",
  "ai_summaries",
  "ai_summary_translations",
  "owner_booking_confirmations",
  "usage_events"
]) {
  assert.equal(
    migrationSql.includes(`alter table public.${table} enable row level security`),
    true,
    `${table} should have row level security enabled`
  );
}
assert.equal(migrationSql.includes("prevent_non_admin_user_role_change"), true, "Non-admin users should not be able to change user roles");
assert.equal(migrationSql.includes("create table if not exists public.audit_events"), true, "Audit events table should exist");
assert.equal(migrationSql.includes("alter table public.audit_events enable row level security"), true, "Audit events should have RLS enabled");
for (const column of [
  "business_id",
  "actor_user_id",
  "actor_role",
  "action",
  "entity_type",
  "entity_id",
  "before_json",
  "after_json",
  "ip_address",
  "user_agent",
  "created_at"
]) {
  assert.equal(migrationSql.includes(column), true, `Audit events should include ${column}`);
}

const auditSource = fs.readFileSync(new URL("../lib/audit.ts", import.meta.url), "utf8");
assert.equal(auditSource.includes("recordAuditEvent"), true, "Audit helper should expose recordAuditEvent");
assert.equal(auditSource.includes("requestAuditContext"), true, "Audit helper should capture dashboard request context");
for (const action of [
  "owner_settings_updated",
  "admin_twilio_numbers_updated",
  "booking_approved",
  "booking_reschedule_requested",
  "booking_callback_requested",
  "booking_not_confirmed",
  "job_status_changed",
  "summary_language_changed",
  "customer_deleted",
  "service_radius_changed",
  "owner_phone_changed"
]) {
  assert.equal(
    ownerActionsSource.includes(action) || adminActionsSource.includes(action) || smsRouteSource.includes(action),
    true,
    `Audit logging should track ${action}`
  );
}

const registry = createActiveVoiceCallRegistry();
const callA = { businessId: "business-1", status: "active_with_ana", twilioCallSid: "CA_A", twilioStreamSid: "MS_A" };
const callB = { businessId: "business-1", status: "active_with_ana", twilioCallSid: "CA_B", twilioStreamSid: "MS_B" };
registry.add(callA);
registry.add(callB);
assert.equal(registry.getByCallSid("CA_A"), callA, "CallSid A should resolve to call A");
assert.equal(registry.getByStreamSid("MS_A"), callA, "StreamSid A should resolve to call A");
assert.equal(registry.getByStreamSid("MS_B"), callB, "StreamSid B should resolve to call B");
assert.equal(registry.countActiveForBusiness("business-1"), 2, "Registry should count simultaneous active calls per business");
registry.remove(callA);
assert.equal(registry.getByStreamSid("MS_A"), undefined, "Stopping call A should remove only StreamSid A");
assert.equal(registry.getByStreamSid("MS_B"), callB, "Stopping call A should not remove call B");

console.log("All tests passed.");
