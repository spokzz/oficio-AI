"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type OnboardingState = {
  error?: string;
  success?: string;
};

const trades = ["landscaping", "roofing", "plumbing", "cleaning", "hvac", "other"] as const;

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

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in as an admin." };
  }

  const { data: adminProfile } = await supabase.from("users").select("role").eq("id", user.id).single();

  if (adminProfile?.role !== "platform_admin") {
    return { error: "Only platform admins can onboard owners." };
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
