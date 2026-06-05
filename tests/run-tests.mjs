import assert from "node:assert/strict";
import fs from "node:fs";
import { estimateLandscapingQuote, estimateMonthlyGrossMargin, isInsideServiceRadius } from "../shared/domain.js";
import { pricingPlan } from "../shared/data.js";
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
  monthlyPrice: pricingPlan.monthlyPrice,
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
  "deleteOwnerCustomer",
  "markOwnerRecentCall"
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
  "updateAdminBusinessName",
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
  "../app/api/twilio/voice/screen/route.ts"
]) {
  const routeSource = fs.readFileSync(new URL(route, import.meta.url), "utf8");
  assert.equal(routeSource.includes("validateTwilioSignature"), true, `${route} should validate X-Twilio-Signature`);
  assert.equal(routeSource.includes("Invalid Twilio signature"), true, `${route} should reject invalid Twilio signatures before webhook logic`);
}

const twilioVoiceRouteSource = fs.readFileSync(new URL("../app/api/twilio/voice/route.ts", import.meta.url), "utf8");
assert.equal(twilioVoiceRouteSource.includes("activeAiCallCapacityStatus"), true, "Voice webhooks should enforce per-business active AI call limits");

const phoneSource = fs.readFileSync(new URL("../lib/phone.ts", import.meta.url), "utf8");
assert.equal(phoneSource.includes("phone?.trim()"), false, "Phone search values should not include unsanitized raw input in query builders");

const callRoutingSource = fs.readFileSync(new URL("../lib/call-routing.ts", import.meta.url), "utf8");
assert.equal(callRoutingSource.includes(".or(filters)"), false, "Call routing should not build raw PostgREST OR filter strings from phone input");
assert.equal(callRoutingSource.includes('.in("twilio_routing_phone", phones)'), true, "Call routing should use fixed-column phone lookups");
assert.equal(callRoutingSource.includes("messaging_service_sid"), true, "Call routing should load per-business Messaging Service SID for outbound SMS");

const twilioSmsRouteSource = fs.readFileSync(new URL("../app/api/twilio/sms/route.ts", import.meta.url), "utf8");
assert.equal(twilioSmsRouteSource.includes("reserveTwilioWebhookEvent(params.MessageSid"), true, "SMS webhooks should dedupe Twilio MessageSid before side effects");
assert.equal(twilioSmsRouteSource.includes("businessSmsSender"), true, "SMS webhooks should send outbound replies from the configured business sender");

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

const smsRouteSource = fs.readFileSync(new URL("../app/api/twilio/sms/route.ts", import.meta.url), "utf8");
assert.equal(smsRouteSource.includes("validCustomerConfirmationSms"), true, "Customer confirmation SMS should be template-validated before sending");

const diagnosticsAuthRouteSource = fs.readFileSync(new URL("../app/api/diagnostics/auth/route.ts", import.meta.url), "utf8");
assert.equal(diagnosticsAuthRouteSource.includes("INTERNAL_WEBHOOK_SECRET"), true, "Auth diagnostics endpoint should require the internal webhook secret");
assert.equal(diagnosticsAuthRouteSource.includes("SUPABASE_SERVICE_ROLE_KEY"), true, "Auth diagnostics should report service key metadata without exposing the key value");
assert.equal(diagnosticsAuthRouteSource.includes("process.env.SUPABASE_SERVICE_ROLE_KEY }"), false, "Auth diagnostics should not render the raw Supabase service key");

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationSql = fs
  .readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => fs.readFileSync(new URL(file, migrationsDirectory), "utf8"))
  .join("\n");
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
  "booking_declined",
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
