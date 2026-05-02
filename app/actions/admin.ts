"use server";

import { revalidatePath } from "next/cache";
import { normalizePhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type OnboardingState = {
  error?: string;
  success?: string;
};

type PhoneSetupState = {
  error?: string;
  success?: string;
};

const trades = ["landscaping", "roofing", "plumbing", "cleaning", "hvac", "other"] as const;
const phoneSetupModes = ["twilio_number", "call_forwarding", "port_existing", "sms_transition"] as const;
const voiceSetupStatuses = ["not_started", "pending", "active", "blocked"] as const;
const smsSetupStatuses = ["not_started", "pending", "active", "transition", "blocked"] as const;

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

  return { supabase } as const;
}

export async function onboardOwner(_state: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const businessName = String(formData.get("businessName") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase();
  const ownerPassword = String(formData.get("ownerPassword") ?? "");
  const trade = String(formData.get("trade") ?? "landscaping");
  const radiusMiles = Number(formData.get("radiusMiles") ?? 30);
  const aiInstructions = String(formData.get("aiInstructions") ?? "").trim();

  if (!businessName || !ownerEmail) {
    return { error: "Business name and owner email are required." };
  }

  if (!trades.includes(trade as (typeof trades)[number])) {
    return { error: "Choose a valid trade." };
  }

  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) {
    return { error: "Choose a valid service radius." };
  }

  const admin = await requirePlatformAdmin();
  if ("error" in admin) {
    return { error: admin.error };
  }
  const { supabase } = admin;

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
      owner_summary_language: "en",
      ai_voice_name: "Ana",
      ai_disclosure: aiInstructions || "Hi, this is Ana, the AI assistant for this business. How can I help?"
    })
    .select("id")
    .single();

  if (businessError || !business) {
    return { error: businessError?.message ?? "Could not create business." };
  }

  const businessId = business.id as string;

  const { error: profileError } = await supabase
    .from("users")
    .update({ full_name: ownerName || null, role: "owner", preferred_language: "en" })
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
    plan_name: "Growth",
    monthly_price: 149,
    onboarding_fee: 199,
    onboarding_paid: false,
    billing_status: "trial",
    internal_notes: aiInstructions || null
  });

  if (billingError) {
    return { error: billingError.message };
  }

  revalidatePath("/admin");

  return { success: `${businessName} was created and linked to ${ownerEmail}.` };
}

export async function updateBusinessPhoneSetup(_state: PhoneSetupState, formData: FormData): Promise<PhoneSetupState> {
  const businessId = String(formData.get("businessId") ?? "").trim();
  const phoneSetupMode = String(formData.get("phoneSetupMode") ?? "");
  const voiceSetupStatus = String(formData.get("voiceSetupStatus") ?? "");
  const smsSetupStatus = String(formData.get("smsSetupStatus") ?? "");
  const businessPhone = normalizePhone(String(formData.get("businessPhone") ?? ""));
  const twilioRoutingPhone = normalizePhone(String(formData.get("twilioRoutingPhone") ?? ""));
  const ownerTransferPhone = normalizePhone(String(formData.get("ownerTransferPhone") ?? ""));
  const messagingServiceSid = String(formData.get("messagingServiceSid") ?? "").trim();
  const phoneSetupNotes = String(formData.get("phoneSetupNotes") ?? "").trim();

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

  if (messagingServiceSid && !/^MG[a-f0-9]{32}$/i.test(messagingServiceSid)) {
    return { error: "Messaging Service SID should start with MG and be 34 characters long." };
  }

  const admin = await requirePlatformAdmin();
  if ("error" in admin) {
    return { error: admin.error };
  }

  const { error } = await admin.supabase
    .from("businesses")
    .update({
      phone: businessPhone,
      twilio_routing_phone: twilioRoutingPhone,
      owner_transfer_phone: ownerTransferPhone,
      phone_setup_mode: phoneSetupMode,
      voice_setup_status: voiceSetupStatus,
      sms_setup_status: smsSetupStatus,
      messaging_service_sid: messagingServiceSid || null,
      phone_setup_notes: phoneSetupNotes || null
    })
    .eq("id", businessId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/owner");

  return { success: "Phone setup saved." };
}
