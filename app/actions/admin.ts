"use server";

import { revalidatePath } from "next/cache";
import { aiCallPlanOptions, normalizeAiCallPlan } from "@/lib/call-usage";
import { geocodeAddress } from "@/lib/geocoding";
import { normalizePhone } from "@/lib/phone";
import { isServiceOption, serviceOptionDefaults } from "@/lib/services";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { validateCurrentUserCsrfToken, validateFormCsrfToken } from "@/lib/csrf";
import { recordAuditEvent, requestAuditContext } from "@/lib/audit";

type OnboardingState = {
  error?: string;
  success?: string;
};

type PhoneSetupState = {
  error?: string;
  success?: string;
};

type InlineEditState = {
  error?: string;
  success?: string;
};

type AdminAccountState = {
  error?: string;
  success?: string;
};

const trades = ["landscaping", "roofing", "plumbing", "cleaning", "hvac", "other"] as const;
const businessStatuses = ["onboarding", "live", "needs_review", "paused", "canceled"] as const;
const phoneSetupModes = ["twilio_number", "call_forwarding", "port_existing", "sms_transition"] as const;
const voiceSetupStatuses = ["not_started", "pending", "active", "blocked"] as const;
const smsSetupStatuses = ["not_started", "pending", "active", "transition", "blocked"] as const;
const existingNumberKinds = ["unknown", "business", "personal", "mixed"] as const;
const portingStatuses = ["not_started", "collecting_info", "submitted", "completed", "blocked"] as const;
const ownerSummaryLanguages = ["en", "es"] as const;
const ownerSummaryChannels = ["sms", "email"] as const;
const minuteLimitPolicies = ["continue_overage", "voicemail", "forward_owner"] as const;
const billingStatuses = ["trial", "active", "past_due", "paused", "canceled"] as const;
const aiCallPlanNames = aiCallPlanOptions.map((plan) => plan.label);

function aiAgentName(value: FormDataEntryValue | null) {
  return String(value ?? "Ana").replace(/\s+/g, " ").trim() || "Ana";
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function nextMonthlyPaymentDueDate(createdAt = new Date()) {
  const year = createdAt.getUTCFullYear();
  const month = createdAt.getUTCMonth();
  const day = createdAt.getUTCDate();
  const lastDayOfNextMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  return new Date(Date.UTC(year, month + 1, Math.min(day, lastDayOfNextMonth))).toISOString().slice(0, 10);
}

async function geocodeBusinessAddress(address: string) {
  const trimmed = address.trim();
  if (!trimmed) return { address: null } as const;

  const geocoded = await geocodeAddress(trimmed);
  if (!geocoded.ok) return { error: geocoded.error } as const;

  return { address: geocoded.address } as const;
}

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in as an admin." } as const;
  }

  const { data: adminProfile } = await supabase.from("users").select("role").eq("id", user.id).single();

  if (adminProfile?.role !== "platform_admin") {
    return { error: "Only platform admins can manage this setup." } as const;
  }

  return { actorRole: "platform_admin", supabase, userId: user.id } as const;
}

function phoneSetupSnapshot(value: {
  ai_voice_name?: unknown;
  booking_time_zone?: unknown;
  business_hours_text?: unknown;
  existing_number_kind?: unknown;
  messaging_service_sid?: unknown;
  minute_limit_policy?: unknown;
  owner_summary_channel?: unknown;
  owner_summary_language?: unknown;
  owner_transfer_phone?: unknown;
  phone?: unknown;
  phone_setup_mode?: unknown;
  phone_setup_notes?: unknown;
  phone_setup_owner_approved?: unknown;
  porting_status?: unknown;
  sms_setup_status?: unknown;
  twilio_routing_phone?: unknown;
  voice_setup_status?: unknown;
}) {
  return {
    ai_voice_name: value.ai_voice_name,
    booking_time_zone: value.booking_time_zone,
    business_hours_text: value.business_hours_text,
    existing_number_kind: value.existing_number_kind,
    messaging_service_sid: value.messaging_service_sid,
    minute_limit_policy: value.minute_limit_policy,
    owner_summary_channel: value.owner_summary_channel,
    owner_summary_language: value.owner_summary_language,
    owner_transfer_phone: value.owner_transfer_phone,
    phone: value.phone,
    phone_setup_mode: value.phone_setup_mode,
    phone_setup_notes: value.phone_setup_notes,
    phone_setup_owner_approved: value.phone_setup_owner_approved,
    porting_status: value.porting_status,
    sms_setup_status: value.sms_setup_status,
    twilio_routing_phone: value.twilio_routing_phone,
    voice_setup_status: value.voice_setup_status
  };
}

export async function onboardOwner(_state: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const csrfError = await validateFormCsrfToken(formData);
  if (csrfError) return { error: csrfError };

  const businessName = String(formData.get("businessName") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase();
  const ownerPassword = String(formData.get("ownerPassword") ?? "");
  const trade = String(formData.get("trade") ?? "landscaping");
  const businessAddress = String(formData.get("businessAddress") ?? "").trim();
  const radiusMiles = Number(formData.get("radiusMiles") ?? 30);
  const agentName = aiAgentName(formData.get("aiAgentName"));
  const phoneSetupMode = String(formData.get("phoneSetupMode") ?? "twilio_number");
  const existingNumberKind = String(formData.get("existingNumberKind") ?? "unknown");
  const businessPhone = normalizePhone(String(formData.get("businessPhone") ?? ""));
  const twilioRoutingPhone = normalizePhone(String(formData.get("twilioRoutingPhone") ?? ""));
  const ownerTransferPhone = normalizePhone(String(formData.get("ownerTransferPhone") ?? ""));
  const messagingServiceSid = String(formData.get("messagingServiceSid") ?? "").trim();
  const minuteLimitPolicy = String(formData.get("minuteLimitPolicy") ?? "continue_overage");
  const phoneSetupNotes = String(formData.get("phoneSetupNotes") ?? "").trim();
  const ownerSummaryLanguage = String(formData.get("ownerSummaryLanguage") ?? "en");
  const ownerSummaryChannel = String(formData.get("ownerSummaryChannel") ?? "sms");
  const bookingTimeZone = String(formData.get("bookingTimeZone") ?? "America/Chicago").trim();
  const businessHoursText = String(formData.get("businessHoursText") ?? "Monday through Friday, 8:00 AM to 5:00 PM").trim();
  const ownerApproved = formData.get("phoneSetupOwnerApproved") === "on";
  const planName = String(formData.get("planName") ?? "Premium").trim();
  const selectedPlan = normalizeAiCallPlan(planName);
  const monthlyPrice = Number(formData.get("monthlyPrice") ?? selectedPlan.monthlyPrice);
  const includedMinutes = Number(formData.get("includedMinutes") ?? selectedPlan.allowanceMinutes);
  const overageStartsAtMinutes = Number(formData.get("overageStartsAtMinutes") ?? selectedPlan.overageStartsAtMinutes);
  const overageRatePerMinute = Number(formData.get("overageRatePerMinute") ?? selectedPlan.overageRatePerMinute);
  const onboardingFee = Number(formData.get("onboardingFee") ?? 199);

  if (!businessName || !ownerEmail) {
    return { error: "Business name and owner email are required." };
  }

  if (!trades.includes(trade as (typeof trades)[number])) {
    return { error: "Choose a valid trade." };
  }

  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) {
    return { error: "Choose a valid service radius." };
  }

  if (agentName.length > 40) {
    return { error: "Enter an AI agent name under 40 characters." };
  }

  if (businessAddress.length > 240) {
    return { error: "Enter a business address under 240 characters." };
  }

  if (!phoneSetupModes.includes(phoneSetupMode as (typeof phoneSetupModes)[number])) {
    return { error: "Choose a valid phone setup mode." };
  }

  if (!existingNumberKinds.includes(existingNumberKind as (typeof existingNumberKinds)[number])) {
    return { error: "Choose a valid existing number type." };
  }

  if (messagingServiceSid && !/^MG[a-f0-9]{32}$/i.test(messagingServiceSid)) {
    return { error: "Messaging Service SID should start with MG and be 34 characters long." };
  }

  if (!minuteLimitPolicies.includes(minuteLimitPolicy as (typeof minuteLimitPolicies)[number])) {
    return { error: "Choose a valid monthly minute limit behavior." };
  }
  if (minuteLimitPolicy === "forward_owner" && !ownerTransferPhone) {
    return { error: "Add an owner transfer cell before forwarding calls at the monthly limit." };
  }

  if (phoneSetupMode === "port_existing" && existingNumberKind !== "business") {
    return { error: "Only port a dedicated business number. Use SMS transition for personal or mixed numbers." };
  }

  if (!ownerSummaryLanguages.includes(ownerSummaryLanguage as (typeof ownerSummaryLanguages)[number])) {
    return { error: "Choose a valid owner summary language." };
  }

  if (!ownerSummaryChannels.includes(ownerSummaryChannel as (typeof ownerSummaryChannels)[number])) {
    return { error: "Choose a valid owner summary method." };
  }

  if (!aiCallPlanNames.includes(planName)) {
    return { error: "Choose a valid AI call plan." };
  }

  if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
    return { error: "Enter a valid monthly price." };
  }

  if (!Number.isInteger(includedMinutes) || includedMinutes < 0) {
    return { error: "Enter valid included minutes." };
  }

  if (!Number.isInteger(overageStartsAtMinutes) || overageStartsAtMinutes < includedMinutes) {
    return { error: "Overage must start at or after the included-minute allowance." };
  }

  if (!Number.isFinite(overageRatePerMinute) || overageRatePerMinute < 0) {
    return { error: "Enter a valid overage price." };
  }

  if (!Number.isFinite(onboardingFee) || onboardingFee < 0) {
    return { error: "Enter a valid onboarding fee." };
  }

  if (!bookingTimeZone || !isValidTimeZone(bookingTimeZone)) {
    return { error: "Choose a valid booking time zone." };
  }

  if (!businessHoursText || businessHoursText.length > 240) {
    return { error: "Enter business hours under 240 characters." };
  }

  const admin = await requirePlatformAdmin();
  if ("error" in admin) {
    return { error: admin.error };
  }
  const { supabase } = admin;
  const geocodedBusinessAddress = await geocodeBusinessAddress(businessAddress);
  if ("error" in geocodedBusinessAddress) {
    return { error: geocodedBusinessAddress.error };
  }

  const { data: ownerProfile, error: ownerError } = await supabase
    .from("users")
    .select("id,email")
    .eq("email", ownerEmail)
    .maybeSingle();

  if (ownerError) {
    return { error: ownerError.message };
  }

  let ownerId = ownerProfile?.id as string | undefined;

  if (!ownerId) {
    if (ownerPassword.length < 8) {
      return { error: "New owner password must be at least 8 characters." };
    }

    let adminSupabase: ReturnType<typeof createAdminClient>;
    try {
      adminSupabase = createAdminClient();
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Admin client is not configured." };
    }

    const { data: createdOwner, error: createOwnerError } = await adminSupabase.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: {
        full_name: ownerName || null
      }
    });

    if (createOwnerError || !createdOwner.user) {
      return { error: createOwnerError?.message ?? "Could not create owner auth user." };
    }

    ownerId = createdOwner.user.id;

    const { error: profileCreateError } = await adminSupabase.from("users").upsert({
      id: ownerId,
      email: ownerEmail,
      full_name: ownerName || null,
      phone: ownerTransferPhone || null,
      preferred_language: "en",
      role: "owner"
    });

    if (profileCreateError) {
      return { error: profileCreateError.message };
    }
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .insert({
      name: businessName,
      trade,
      status: "onboarding",
      phone: businessPhone,
      base_address: geocodedBusinessAddress.address?.formattedAddress ?? (businessAddress || null),
      base_geocode_accuracy: geocodedBusinessAddress.address?.accuracy ?? null,
      base_geocode_provider: geocodedBusinessAddress.address?.provider ?? null,
      base_geocoded_at: geocodedBusinessAddress.address ? new Date().toISOString() : null,
      base_lat: geocodedBusinessAddress.address?.lat ?? null,
      base_lng: geocodedBusinessAddress.address?.lng ?? null,
      twilio_routing_phone: twilioRoutingPhone,
      owner_transfer_phone: ownerTransferPhone,
      phone_setup_mode: phoneSetupMode,
      voice_setup_status: phoneSetupMode === "twilio_number" && twilioRoutingPhone ? "active" : "pending",
      sms_setup_status: phoneSetupMode === "sms_transition" ? "transition" : phoneSetupMode === "twilio_number" && twilioRoutingPhone ? "active" : "pending",
      messaging_service_sid: messagingServiceSid || null,
      minute_limit_policy: minuteLimitPolicy,
      existing_number_kind: existingNumberKind,
      porting_status: phoneSetupMode === "port_existing" ? "collecting_info" : "not_started",
      phone_setup_owner_approved: ownerApproved,
      phone_setup_notes: phoneSetupNotes || null,
      owner_summary_language: ownerSummaryLanguage,
      owner_summary_channel: ownerSummaryChannel,
      booking_time_zone: bookingTimeZone,
      business_hours_text: businessHoursText,
      ai_voice_name: agentName,
      ai_disclosure: `Hi, this is ${agentName}, the AI assistant for this business. How can I help?`
    })
    .select("id")
    .single();

  if (businessError || !business) {
    return { error: businessError?.message ?? "Could not create business." };
  }

  const businessId = business.id as string;

  const { error: profileError } = await supabase
    .from("users")
    .update({
      full_name: ownerName || null,
      ...(ownerTransferPhone ? { phone: ownerTransferPhone } : {}),
      role: "owner",
      preferred_language: "en"
    })
    .eq("id", ownerId);

  if (profileError) {
    return { error: profileError.message };
  }

  const { error: membershipError } = await supabase.from("business_users").upsert(
    {
      business_id: businessId,
      user_id: ownerId,
      role: "owner"
    },
    { onConflict: "business_id,user_id" }
  );

  if (membershipError) {
    return { error: membershipError.message };
  }

  const { error: radiusError } = await supabase.from("service_radius_rules").insert({
    business_id: businessId,
    radius_miles: radiusMiles,
    allow_outside_radius: false,
    require_owner_approval_outside_radius: true
  });

  if (radiusError) {
    return { error: radiusError.message };
  }

  const { error: billingError } = await supabase.from("manual_billing_accounts").insert({
    business_id: businessId,
    plan_name: planName,
    monthly_price: monthlyPrice,
    included_minutes: includedMinutes,
    overage_starts_at_minutes: overageStartsAtMinutes,
    overage_rate_per_minute: overageRatePerMinute,
    onboarding_fee: onboardingFee,
    onboarding_paid: false,
    billing_status: "trial",
    next_payment_due_at: nextMonthlyPaymentDueDate()
  });

  if (billingError) {
    return { error: billingError.message };
  }

  revalidatePath("/admin");

  return { success: `${businessName} was created and linked to ${ownerEmail}.` };
}

export async function updateBusinessPhoneSetup(_state: PhoneSetupState, formData: FormData): Promise<PhoneSetupState> {
  const csrfError = await validateFormCsrfToken(formData);
  if (csrfError) return { error: csrfError };

  const businessId = String(formData.get("businessId") ?? "").trim();
  const phoneSetupMode = String(formData.get("phoneSetupMode") ?? "");
  const voiceSetupStatus = String(formData.get("voiceSetupStatus") ?? "");
  const smsSetupStatus = String(formData.get("smsSetupStatus") ?? "");
  const existingNumberKind = String(formData.get("existingNumberKind") ?? "unknown");
  const businessAddress = String(formData.get("businessAddress") ?? "").trim();
  const portingStatus = String(formData.get("portingStatus") ?? "not_started");
  const businessPhone = normalizePhone(String(formData.get("businessPhone") ?? ""));
  const twilioRoutingPhone = normalizePhone(String(formData.get("twilioRoutingPhone") ?? ""));
  const ownerTransferPhone = normalizePhone(String(formData.get("ownerTransferPhone") ?? ""));
  const messagingServiceSid = String(formData.get("messagingServiceSid") ?? "").trim();
  const minuteLimitPolicy = String(formData.get("minuteLimitPolicy") ?? "continue_overage");
  const phoneSetupNotes = String(formData.get("phoneSetupNotes") ?? "").trim();
  const ownerSummaryLanguage = String(formData.get("ownerSummaryLanguage") ?? "en");
  const ownerSummaryChannel = String(formData.get("ownerSummaryChannel") ?? "sms");
  const bookingTimeZone = String(formData.get("bookingTimeZone") ?? "America/Chicago").trim();
  const businessHoursText = String(formData.get("businessHoursText") ?? "Monday through Friday, 8:00 AM to 5:00 PM").trim();
  const agentName = aiAgentName(formData.get("aiAgentName"));
  const ownerApproved = formData.get("phoneSetupOwnerApproved") === "on";

  if (!businessId) {
    return { error: "Business id is required." };
  }

  if (!phoneSetupModes.includes(phoneSetupMode as (typeof phoneSetupModes)[number])) {
    return { error: "Choose a valid phone setup mode." };
  }

  if (!voiceSetupStatuses.includes(voiceSetupStatus as (typeof voiceSetupStatuses)[number])) {
    return { error: "Choose a valid voice setup status." };
  }

  if (!smsSetupStatuses.includes(smsSetupStatus as (typeof smsSetupStatuses)[number])) {
    return { error: "Choose a valid SMS setup status." };
  }

  if (!existingNumberKinds.includes(existingNumberKind as (typeof existingNumberKinds)[number])) {
    return { error: "Choose a valid existing number type." };
  }

  if (!portingStatuses.includes(portingStatus as (typeof portingStatuses)[number])) {
    return { error: "Choose a valid porting status." };
  }

  if (messagingServiceSid && !/^MG[a-f0-9]{32}$/i.test(messagingServiceSid)) {
    return { error: "Messaging Service SID should start with MG and be 34 characters long." };
  }

  if (!minuteLimitPolicies.includes(minuteLimitPolicy as (typeof minuteLimitPolicies)[number])) {
    return { error: "Choose a valid monthly minute limit behavior." };
  }
  if (minuteLimitPolicy === "forward_owner" && !ownerTransferPhone) {
    return { error: "Add an owner transfer cell before forwarding calls at the monthly limit." };
  }

  if (businessAddress.length > 240) {
    return { error: "Enter a business address under 240 characters." };
  }

  if (agentName.length > 40) {
    return { error: "Enter an AI agent name under 40 characters." };
  }

  if (phoneSetupMode === "port_existing" && existingNumberKind !== "business") {
    return { error: "Only port a dedicated business number. Use SMS transition for personal or mixed numbers." };
  }

  if (!ownerSummaryLanguages.includes(ownerSummaryLanguage as (typeof ownerSummaryLanguages)[number])) {
    return { error: "Choose a valid owner summary language." };
  }

  if (!ownerSummaryChannels.includes(ownerSummaryChannel as (typeof ownerSummaryChannels)[number])) {
    return { error: "Choose a valid owner summary method." };
  }

  if (!bookingTimeZone || !isValidTimeZone(bookingTimeZone)) {
    return { error: "Choose a valid booking time zone." };
  }

  if (!businessHoursText || businessHoursText.length > 240) {
    return { error: "Enter business hours under 240 characters." };
  }

  const admin = await requirePlatformAdmin();
  if ("error" in admin) {
    return { error: admin.error };
  }

  const geocodedBusinessAddress = await geocodeBusinessAddress(businessAddress);
  if ("error" in geocodedBusinessAddress) {
    return { error: geocodedBusinessAddress.error };
  }

  const { data: beforePhoneSetup, error: beforePhoneSetupError } = await admin.supabase
    .from("businesses")
    .select(
      "ai_voice_name,booking_time_zone,business_hours_text,existing_number_kind,messaging_service_sid,minute_limit_policy,owner_summary_channel,owner_summary_language,owner_transfer_phone,phone,phone_setup_mode,phone_setup_notes,phone_setup_owner_approved,porting_status,sms_setup_status,twilio_routing_phone,voice_setup_status"
    )
    .eq("id", businessId)
    .maybeSingle();

  if (beforePhoneSetupError) {
    return { error: beforePhoneSetupError.message };
  }

  const phoneSetupPayload = {
    phone: businessPhone,
    base_address: geocodedBusinessAddress.address?.formattedAddress ?? (businessAddress || null),
    base_geocode_accuracy: geocodedBusinessAddress.address?.accuracy ?? null,
    base_geocode_provider: geocodedBusinessAddress.address?.provider ?? null,
    base_geocoded_at: geocodedBusinessAddress.address ? new Date().toISOString() : null,
    base_lat: geocodedBusinessAddress.address?.lat ?? null,
    base_lng: geocodedBusinessAddress.address?.lng ?? null,
    twilio_routing_phone: twilioRoutingPhone,
    owner_transfer_phone: ownerTransferPhone,
    phone_setup_mode: phoneSetupMode,
    voice_setup_status: voiceSetupStatus,
    sms_setup_status: smsSetupStatus,
    messaging_service_sid: messagingServiceSid || null,
    minute_limit_policy: minuteLimitPolicy,
    owner_summary_channel: ownerSummaryChannel,
    owner_summary_language: ownerSummaryLanguage,
    booking_time_zone: bookingTimeZone,
    business_hours_text: businessHoursText,
    ai_voice_name: agentName,
    ai_disclosure: `Hi, this is ${agentName}, the AI assistant for this business. How can I help?`,
    existing_number_kind: existingNumberKind,
    porting_status: phoneSetupMode === "port_existing" ? portingStatus : "not_started",
    phone_setup_owner_approved: ownerApproved,
    phone_setup_notes: phoneSetupNotes || null
  };

  const { error } = await admin.supabase
    .from("businesses")
    .update(phoneSetupPayload)
    .eq("id", businessId);

  if (error) {
    return { error: error.message };
  }

  const auditContext = await requestAuditContext(admin.actorRole, admin.userId);
  await recordAuditEvent(admin.supabase, {
    ...auditContext,
    action: "phone_setup_updated",
    after: phoneSetupSnapshot(phoneSetupPayload),
    before: beforePhoneSetup ? phoneSetupSnapshot(beforePhoneSetup) : null,
    businessId,
    entityId: businessId,
    entityType: "business"
  });

  if (
    beforePhoneSetup?.twilio_routing_phone !== twilioRoutingPhone ||
    beforePhoneSetup?.messaging_service_sid !== (messagingServiceSid || null)
  ) {
    await recordAuditEvent(admin.supabase, {
      ...auditContext,
      action: "admin_twilio_numbers_updated",
      after: {
        messaging_service_sid: messagingServiceSid || null,
        twilio_routing_phone: twilioRoutingPhone
      },
      before: {
        messaging_service_sid: beforePhoneSetup?.messaging_service_sid ?? null,
        twilio_routing_phone: beforePhoneSetup?.twilio_routing_phone ?? null
      },
      businessId,
      entityId: businessId,
      entityType: "business"
    });
  }

  if (beforePhoneSetup?.owner_summary_language !== ownerSummaryLanguage) {
    await recordAuditEvent(admin.supabase, {
      ...auditContext,
      action: "summary_language_changed",
      after: { owner_summary_language: ownerSummaryLanguage },
      before: { owner_summary_language: beforePhoneSetup?.owner_summary_language ?? null },
      businessId,
      entityId: businessId,
      entityType: "business"
    });
  }

  revalidatePath("/admin");
  revalidatePath("/owner");

  return { success: "Phone setup saved." };
}

export async function updateAdminOwnerName(_state: InlineEditState, formData: FormData): Promise<InlineEditState> {
  const csrfError = await validateFormCsrfToken(formData);
  if (csrfError) return { error: csrfError };

  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();

  if (!ownerId) {
    return { error: "Owner id is required." };
  }

  if (!ownerName || ownerName.length > 120) {
    return { error: "Enter an owner name under 120 characters." };
  }

  const admin = await requirePlatformAdmin();
  if ("error" in admin) {
    return { error: admin.error };
  }

  const { error } = await admin.supabase.from("users").update({ full_name: ownerName }).eq("id", ownerId).eq("role", "owner");

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/owner");

  return { success: "Owner name saved." };
}

export async function updateAdminAccount(_state: AdminAccountState, formData: FormData): Promise<AdminAccountState> {
  const csrfError = await validateFormCsrfToken(formData);
  if (csrfError) return { error: csrfError };

  const businessId = String(formData.get("businessId") ?? "").trim();
  const businessName = String(formData.get("businessName") ?? "").trim();
  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const ownerPhone = normalizePhone(String(formData.get("ownerPhone") ?? ""));
  const trade = String(formData.get("trade") ?? "landscaping");
  const businessStatus = String(formData.get("businessStatus") ?? "onboarding");
  const businessAddress = String(formData.get("businessAddress") ?? "").trim();
  const radiusMiles = Number(formData.get("radiusMiles") ?? 30);
  const phoneSetupMode = String(formData.get("phoneSetupMode") ?? "");
  const voiceSetupStatus = String(formData.get("voiceSetupStatus") ?? "");
  const smsSetupStatus = String(formData.get("smsSetupStatus") ?? "");
  const existingNumberKind = String(formData.get("existingNumberKind") ?? "unknown");
  const portingStatus = String(formData.get("portingStatus") ?? "not_started");
  const businessPhone = normalizePhone(String(formData.get("businessPhone") ?? ""));
  const twilioRoutingPhone = normalizePhone(String(formData.get("twilioRoutingPhone") ?? ""));
  const ownerTransferPhone = normalizePhone(String(formData.get("ownerTransferPhone") ?? ""));
  const messagingServiceSid = String(formData.get("messagingServiceSid") ?? "").trim();
  const minuteLimitPolicy = String(formData.get("minuteLimitPolicy") ?? "continue_overage");
  const phoneSetupNotes = String(formData.get("phoneSetupNotes") ?? "").trim();
  const ownerSummaryLanguage = String(formData.get("ownerSummaryLanguage") ?? "en");
  const ownerSummaryChannel = String(formData.get("ownerSummaryChannel") ?? "sms");
  const bookingTimeZone = String(formData.get("bookingTimeZone") ?? "America/Chicago").trim();
  const businessHoursText = String(formData.get("businessHoursText") ?? "Monday through Friday, 8:00 AM to 5:00 PM").trim();
  const agentName = aiAgentName(formData.get("aiAgentName"));
  const ownerApproved = formData.get("phoneSetupOwnerApproved") === "on";
  const planName = String(formData.get("planName") ?? "Premium").trim();
  const selectedPlan = normalizeAiCallPlan(planName);
  const monthlyPrice = Number(formData.get("monthlyPrice") ?? selectedPlan.monthlyPrice);
  const includedMinutes = Number(formData.get("includedMinutes") ?? selectedPlan.allowanceMinutes);
  const overageStartsAtMinutes = Number(formData.get("overageStartsAtMinutes") ?? selectedPlan.overageStartsAtMinutes);
  const overageRatePerMinute = Number(formData.get("overageRatePerMinute") ?? selectedPlan.overageRatePerMinute);
  const onboardingFee = Number(formData.get("onboardingFee") ?? 199);
  const onboardingPaid = formData.get("onboardingPaid") === "on";
  const billingStatus = String(formData.get("billingStatus") ?? "trial");
  const nextPaymentDueAt = String(formData.get("nextPaymentDueAt") ?? "").trim();
  const paymentMethodNote = String(formData.get("paymentMethodNote") ?? "").trim();
  const allowOutsideRadius = String(formData.get("allowOutsideRadius") ?? "false") === "true";
  const availableServices = formData
    .getAll("availableServices")
    .map((service) => String(service))
    .filter((service, index, services) => services.indexOf(service) === index);

  if (!businessId) return { error: "Business id is required." };
  if (!businessName || businessName.length > 120) return { error: "Enter a business name under 120 characters." };
  if (ownerName.length > 120) return { error: "Enter an owner name under 120 characters." };
  if (!trades.includes(trade as (typeof trades)[number])) return { error: "Choose a valid trade." };
  if (!businessStatuses.includes(businessStatus as (typeof businessStatuses)[number])) return { error: "Choose a valid business status." };
  if (!Number.isFinite(radiusMiles) || radiusMiles < 1 || radiusMiles > 250) return { error: "Enter a service radius between 1 and 250 miles." };
  if (!phoneSetupModes.includes(phoneSetupMode as (typeof phoneSetupModes)[number])) return { error: "Choose a valid phone setup mode." };
  if (!voiceSetupStatuses.includes(voiceSetupStatus as (typeof voiceSetupStatuses)[number])) return { error: "Choose a valid voice setup status." };
  if (!smsSetupStatuses.includes(smsSetupStatus as (typeof smsSetupStatuses)[number])) return { error: "Choose a valid SMS setup status." };
  if (!existingNumberKinds.includes(existingNumberKind as (typeof existingNumberKinds)[number])) return { error: "Choose a valid existing number type." };
  if (!portingStatuses.includes(portingStatus as (typeof portingStatuses)[number])) return { error: "Choose a valid porting status." };
  if (!ownerSummaryLanguages.includes(ownerSummaryLanguage as (typeof ownerSummaryLanguages)[number])) return { error: "Choose a valid owner summary language." };
  if (!ownerSummaryChannels.includes(ownerSummaryChannel as (typeof ownerSummaryChannels)[number])) return { error: "Choose a valid owner summary method." };
  if (!billingStatuses.includes(billingStatus as (typeof billingStatuses)[number])) return { error: "Choose a valid billing status." };
  if (availableServices.some((service) => !isServiceOption(service))) return { error: "Choose valid services." };
  if (messagingServiceSid && !/^MG[a-f0-9]{32}$/i.test(messagingServiceSid)) return { error: "Messaging Service SID should start with MG and be 34 characters long." };
  if (!minuteLimitPolicies.includes(minuteLimitPolicy as (typeof minuteLimitPolicies)[number])) return { error: "Choose a valid monthly minute limit behavior." };
  if (minuteLimitPolicy === "forward_owner" && !ownerTransferPhone && !ownerPhone) return { error: "Add an owner phone before forwarding calls at the monthly limit." };
  if (phoneSetupMode === "port_existing" && existingNumberKind !== "business") return { error: "Only port a dedicated business number. Use SMS transition for personal or mixed numbers." };
  if (!bookingTimeZone || !isValidTimeZone(bookingTimeZone)) return { error: "Choose a valid booking time zone." };
  if (!businessHoursText || businessHoursText.length > 240) return { error: "Enter business hours under 240 characters." };
  if (businessAddress.length > 240) return { error: "Enter a business address under 240 characters." };
  if (agentName.length > 40) return { error: "Enter an AI agent name under 40 characters." };
  if (!aiCallPlanNames.includes(planName)) return { error: "Choose a valid AI call plan." };
  if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) return { error: "Enter a valid monthly price." };
  if (!Number.isInteger(includedMinutes) || includedMinutes < 0) return { error: "Enter valid included minutes." };
  if (!Number.isInteger(overageStartsAtMinutes) || overageStartsAtMinutes < includedMinutes) {
    return { error: "Overage must start at or after the included-minute allowance." };
  }
  if (!Number.isFinite(overageRatePerMinute) || overageRatePerMinute < 0) return { error: "Enter a valid overage price." };
  if (!Number.isFinite(onboardingFee) || onboardingFee < 0) return { error: "Enter a valid onboarding fee." };

  const admin = await requirePlatformAdmin();
  if ("error" in admin) return { error: admin.error };

  const geocodedBusinessAddress = await geocodeBusinessAddress(businessAddress);
  if ("error" in geocodedBusinessAddress) return { error: geocodedBusinessAddress.error };

  const { data: beforeBusiness, error: beforeBusinessError } = await admin.supabase
    .from("businesses")
    .select(
      "ai_voice_name,available_services,base_address,base_geocode_accuracy,base_geocode_provider,base_lat,base_lng,booking_time_zone,business_hours_text,existing_number_kind,messaging_service_sid,minute_limit_policy,name,owner_summary_channel,owner_summary_language,owner_transfer_phone,phone,phone_setup_mode,phone_setup_notes,phone_setup_owner_approved,porting_status,sms_setup_status,status,trade,twilio_routing_phone,voice_setup_status"
    )
    .eq("id", businessId)
    .maybeSingle();

  if (beforeBusinessError) return { error: beforeBusinessError.message };

  const { data: beforeOwner, error: beforeOwnerError } = ownerId
    ? await admin.supabase.from("users").select("id,full_name,phone").eq("id", ownerId).eq("role", "owner").maybeSingle()
    : { data: null, error: null };

  if (beforeOwnerError) return { error: beforeOwnerError.message };

  const { data: beforeRadiusRule, error: beforeRadiusReadError } = await admin.supabase
    .from("service_radius_rules")
    .select("id,radius_miles,allow_outside_radius,require_owner_approval_outside_radius")
    .eq("business_id", businessId)
    .limit(1)
    .maybeSingle();

  if (beforeRadiusReadError) return { error: beforeRadiusReadError.message };

  const businessPayload = {
    name: businessName,
    trade,
    status: businessStatus,
    phone: businessPhone,
    base_address: geocodedBusinessAddress.address?.formattedAddress ?? (businessAddress || null),
    base_geocode_accuracy: geocodedBusinessAddress.address?.accuracy ?? null,
    base_geocode_provider: geocodedBusinessAddress.address?.provider ?? null,
    base_geocoded_at: geocodedBusinessAddress.address ? new Date().toISOString() : null,
    base_lat: geocodedBusinessAddress.address?.lat ?? null,
    base_lng: geocodedBusinessAddress.address?.lng ?? null,
    twilio_routing_phone: twilioRoutingPhone,
    owner_transfer_phone: ownerTransferPhone,
    phone_setup_mode: phoneSetupMode,
    voice_setup_status: voiceSetupStatus,
    sms_setup_status: smsSetupStatus,
    messaging_service_sid: messagingServiceSid || null,
    minute_limit_policy: minuteLimitPolicy,
    owner_summary_channel: ownerSummaryChannel,
    owner_summary_language: ownerSummaryLanguage,
    available_services: availableServices.length ? availableServices : serviceOptionDefaults(),
    booking_time_zone: bookingTimeZone,
    business_hours_text: businessHoursText,
    ai_voice_name: agentName,
    ai_disclosure: `Hi, this is ${agentName}, the AI assistant for this business. How can I help?`,
    existing_number_kind: existingNumberKind,
    porting_status: phoneSetupMode === "port_existing" ? portingStatus : "not_started",
    phone_setup_owner_approved: ownerApproved,
    phone_setup_notes: phoneSetupNotes || null
  };

  const { error: businessError } = await admin.supabase
    .from("businesses")
    .update(businessPayload)
    .eq("id", businessId);

  if (businessError) return { error: businessError.message };

  if (ownerId) {
    const { error: ownerError } = await admin.supabase
      .from("users")
      .update({
        full_name: ownerName || null,
        phone: ownerPhone || null
      })
      .eq("id", ownerId)
      .eq("role", "owner");
    if (ownerError) return { error: ownerError.message };
  }

  const radiusPayload = {
    allow_outside_radius: allowOutsideRadius,
    business_id: businessId,
    radius_miles: Math.round(radiusMiles),
    require_owner_approval_outside_radius: allowOutsideRadius
  };

  const { error: radiusError } = beforeRadiusRule?.id
    ? await admin.supabase.from("service_radius_rules").update(radiusPayload).eq("id", beforeRadiusRule.id)
    : await admin.supabase.from("service_radius_rules").insert(radiusPayload);
  if (radiusError) return { error: radiusError.message };

  const { error: billingError } = await admin.supabase.from("manual_billing_accounts").upsert(
    {
      business_id: businessId,
      plan_name: planName,
      monthly_price: monthlyPrice,
      included_minutes: includedMinutes,
      overage_starts_at_minutes: overageStartsAtMinutes,
      overage_rate_per_minute: overageRatePerMinute,
      onboarding_fee: onboardingFee,
      onboarding_paid: onboardingPaid,
      billing_status: billingStatus,
      next_payment_due_at: nextPaymentDueAt || null,
      payment_method_note: paymentMethodNote || null
    },
    { onConflict: "business_id" }
  );
  if (billingError) return { error: billingError.message };

  const auditContext = await requestAuditContext(admin.actorRole, admin.userId);
  if (
    beforeBusiness?.twilio_routing_phone !== twilioRoutingPhone ||
    beforeBusiness?.messaging_service_sid !== (messagingServiceSid || null)
  ) {
    await recordAuditEvent(admin.supabase, {
      ...auditContext,
      action: "admin_twilio_numbers_updated",
      after: {
        messaging_service_sid: messagingServiceSid || null,
        twilio_routing_phone: twilioRoutingPhone
      },
      before: {
        messaging_service_sid: beforeBusiness?.messaging_service_sid ?? null,
        twilio_routing_phone: beforeBusiness?.twilio_routing_phone ?? null
      },
      businessId,
      entityId: businessId,
      entityType: "business"
    });
  }

  if (beforeBusiness?.owner_summary_language !== ownerSummaryLanguage) {
    await recordAuditEvent(admin.supabase, {
      ...auditContext,
      action: "summary_language_changed",
      after: { owner_summary_language: ownerSummaryLanguage },
      before: { owner_summary_language: beforeBusiness?.owner_summary_language ?? null },
      businessId,
      entityId: businessId,
      entityType: "business"
    });
  }

  if (
    beforeRadiusRule?.radius_miles !== radiusPayload.radius_miles ||
    beforeRadiusRule?.allow_outside_radius !== radiusPayload.allow_outside_radius ||
    beforeRadiusRule?.require_owner_approval_outside_radius !== radiusPayload.require_owner_approval_outside_radius
  ) {
    await recordAuditEvent(admin.supabase, {
      ...auditContext,
      action: "service_radius_changed",
      after: {
        allow_outside_radius: radiusPayload.allow_outside_radius,
        radius_miles: radiusPayload.radius_miles,
        require_owner_approval_outside_radius: radiusPayload.require_owner_approval_outside_radius
      },
      before: {
        allow_outside_radius: beforeRadiusRule?.allow_outside_radius ?? null,
        radius_miles: beforeRadiusRule?.radius_miles ?? null,
        require_owner_approval_outside_radius: beforeRadiusRule?.require_owner_approval_outside_radius ?? null
      },
      businessId,
      entityId: beforeRadiusRule?.id ?? businessId,
      entityType: "service_radius_rule"
    });
  }

  if (ownerId && beforeOwner?.phone !== (ownerPhone || null)) {
    await recordAuditEvent(admin.supabase, {
      ...auditContext,
      action: "owner_phone_changed",
      after: { phone: ownerPhone || null },
      before: { phone: beforeOwner?.phone ?? null },
      businessId,
      entityId: ownerId,
      entityType: "user"
    });
  }

  revalidatePath("/admin");
  revalidatePath("/owner");

  return { success: "Account saved." };
}

export async function deleteAdminAccount(businessId: string, csrfToken: string): Promise<AdminAccountState> {
  const csrfError = await validateCurrentUserCsrfToken(csrfToken);
  if (csrfError) return { error: csrfError };

  const trimmedBusinessId = businessId.trim();
  if (!trimmedBusinessId) return { error: "Business id is required." };

  const admin = await requirePlatformAdmin();
  if ("error" in admin) return { error: admin.error };

  let adminSupabase: ReturnType<typeof createAdminClient>;
  try {
    adminSupabase = createAdminClient();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Admin client is not configured." };
  }

  const { error } = await adminSupabase.from("businesses").delete().eq("id", trimmedBusinessId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/owner");

  return { success: "Account deleted." };
}

export async function addAdminAvailabilityException(_state: AdminAccountState, formData: FormData): Promise<AdminAccountState> {
  const csrfError = await validateFormCsrfToken(formData);
  if (csrfError) return { error: csrfError };

  const businessId = String(formData.get("businessId") ?? "").trim();
  const title = String(formData.get("title") ?? "Closed").replace(/\s+/g, " ").trim();
  const startsOn = String(formData.get("startsOn") ?? "").trim();
  const endsOn = String(formData.get("endsOn") ?? "").trim();
  const message = String(formData.get("message") ?? "").replace(/\s+/g, " ").trim();

  if (!businessId) return { error: "Business id is required." };
  if (!title || title.length > 80) return { error: "Enter a closure reason under 80 characters." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return { error: "Choose valid start and end dates." };
  if (endsOn < startsOn) return { error: "End date must be after the start date." };
  if (message.length > 180) return { error: "Keep the customer message under 180 characters." };

  const admin = await requirePlatformAdmin();
  if ("error" in admin) return { error: admin.error };

  const { error } = await admin.supabase.from("business_availability_exceptions").insert({
    business_id: businessId,
    ends_on: endsOn,
    message: message || null,
    starts_on: startsOn,
    title
  });
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/owner");

  return { success: "Closed dates saved." };
}

export async function deleteAdminAvailabilityException(exceptionId: string, csrfToken: string): Promise<AdminAccountState> {
  const csrfError = await validateCurrentUserCsrfToken(csrfToken);
  if (csrfError) return { error: csrfError };

  const trimmedExceptionId = exceptionId.trim();
  if (!trimmedExceptionId) return { error: "Closure id is required." };

  const admin = await requirePlatformAdmin();
  if ("error" in admin) return { error: admin.error };

  const { error } = await admin.supabase.from("business_availability_exceptions").delete().eq("id", trimmedExceptionId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/owner");

  return { success: "Closed dates removed." };
}
