import { createAdminClient } from "@/lib/supabase/admin";
import { buildAiCallUsage, monthWindow, sumUsageMinutes } from "@/lib/call-usage";
import { normalizePhone, phoneSearchValues } from "@/lib/phone";
import { xmlEscape } from "@/lib/twilio";

export type ContactClassification = "customer" | "personal" | "vendor" | "spam" | "unknown";

export type RoutingBusiness = {
  id: string;
  name: string;
  trade: string;
  phone: string | null;
  twilio_routing_phone: string | null;
  owner_transfer_phone: string | null;
  owner_summary_language?: string | null;
  ai_voice_name: string;
  ai_disclosure?: string | null;
};

export type RoutingOwner = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

export type RoutingContext = {
  business: RoutingBusiness;
  owner: RoutingOwner | null;
  ownerPhone: string | null;
};

export type KnownCaller = {
  classification: ContactClassification;
  customerId: string | null;
  displayName: string | null;
};

export async function aiCallAllowanceStatus(businessId: string) {
  const supabase = createAdminClient();
  const usageWindow = monthWindow();
  const [{ data: billing }, { data: usageEvents }] = await Promise.all([
    supabase.from("manual_billing_accounts").select("plan_name").eq("business_id", businessId).maybeSingle<{ plan_name: string | null }>(),
    supabase
      .from("usage_events")
      .select("quantity")
      .eq("business_id", businessId)
      .eq("event_type", "qualified_business_voice")
      .eq("unit", "minute")
      .gte("occurred_at", usageWindow.monthStart.toISOString())
      .lt("occurred_at", usageWindow.nextMonthStart.toISOString())
  ]);
  const usage = buildAiCallUsage({
    planName: billing?.plan_name,
    usedMinutes: sumUsageMinutes((usageEvents ?? []) as Array<{ quantity: number | string | null }>)
  });

  return {
    allowed: usage.planKey === "vip" || usage.usedMinutes < usage.allowanceMinutes,
    usage
  };
}

export async function findBusinessRoutingContext(toPhone: string | null | undefined): Promise<RoutingContext | null> {
  const supabase = createAdminClient();
  const phones = phoneSearchValues(toPhone);

  if (!phones.length) return null;

  const filters = phones.flatMap((phone) => [`twilio_routing_phone.eq.${phone}`, `phone.eq.${phone}`]).join(",");
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id,name,trade,phone,twilio_routing_phone,owner_transfer_phone,owner_summary_language,ai_voice_name,ai_disclosure")
    .or(filters)
    .limit(1)
    .maybeSingle<RoutingBusiness>();

  if (businessError || !business) {
    return null;
  }

  const { data: membership } = await supabase
    .from("business_users")
    .select("user_id")
    .eq("business_id", business.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  let owner: RoutingOwner | null = null;

  if (membership?.user_id) {
    const { data: ownerProfile } = await supabase
      .from("users")
      .select("id,full_name,phone")
      .eq("id", membership.user_id as string)
      .maybeSingle<RoutingOwner>();

    owner = ownerProfile ?? null;
  }

  return {
    business,
    owner,
    ownerPhone: normalizePhone(business.owner_transfer_phone) ?? normalizePhone(owner?.phone)
  };
}

export async function findKnownCaller(businessId: string, fromPhone: string | null | undefined): Promise<KnownCaller> {
  const supabase = createAdminClient();
  const phone = normalizePhone(fromPhone);

  if (!phone) {
    return { classification: "unknown", customerId: null, displayName: null };
  }

  const { data: contact } = await supabase
    .from("caller_contacts")
    .select("classification, customer_id, display_name")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle<{ classification: ContactClassification; customer_id: string | null; display_name: string | null }>();

  if (contact?.classification && contact.classification !== "unknown") {
    return {
      classification: contact.classification,
      customerId: contact.customer_id,
      displayName: contact.display_name
    };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, full_name")
    .eq("business_id", businessId)
    .in("phone", phoneSearchValues(fromPhone))
    .limit(1)
    .maybeSingle<{ id: string; full_name: string | null }>();

  if (customer?.id) {
    return { classification: "customer", customerId: customer.id, displayName: customer.full_name };
  }

  return { classification: "unknown", customerId: null, displayName: null };
}

export async function ensurePhoneCustomer({
  businessId,
  fromPhone,
  displayName
}: {
  businessId: string;
  fromPhone: string | null | undefined;
  displayName?: string | null;
}) {
  const supabase = createAdminClient();
  const phone = normalizePhone(fromPhone);
  if (!phone) return null;

  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .in("phone", phoneSearchValues(fromPhone))
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existing?.id) return existing.id;

  const fullName = displayName?.trim() || `Caller ${phone}`;
  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      business_id: businessId,
      full_name: fullName,
      phone,
      preferred_language: "auto",
      referral_source: "other",
      notes: "Created by Ana after caller screened as business."
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  await upsertCallerContact({
    businessId,
    classification: "customer",
    customerId: customer.id,
    displayName: fullName,
    phone
  });

  return customer.id;
}

export async function createCallSession({
  businessId,
  customerId,
  fromPhone,
  toPhone,
  providerCallId,
  contactType,
  screeningResult,
  status = "active",
  outcome,
  needsOwnerReview = false,
  transferredToOwner = false
}: {
  businessId: string;
  customerId?: string | null;
  fromPhone: string | null | undefined;
  toPhone: string | null | undefined;
  providerCallId: string | null | undefined;
  contactType: ContactClassification;
  screeningResult: string;
  status?: "active" | "completed" | "missed" | "failed" | "transferred";
  outcome?: string;
  needsOwnerReview?: boolean;
  transferredToOwner?: boolean;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("call_sessions")
    .insert({
      business_id: businessId,
      customer_id: customerId ?? null,
      provider_call_id: providerCallId || null,
      from_phone: normalizePhone(fromPhone),
      to_phone: normalizePhone(toPhone),
      contact_type: contactType,
      screening_result: screeningResult,
      status,
      outcome: outcome ?? null,
      needs_owner_review: needsOwnerReview,
      transferred_to_owner_at: transferredToOwner ? new Date().toISOString() : null
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data.id;
}

export async function updateCallSessionByProviderId(providerCallId: string, values: Record<string, unknown>) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("call_sessions").update(values).eq("provider_call_id", providerCallId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertCallerContact({
  businessId,
  phone,
  classification,
  customerId,
  displayName,
  confirmedByOwner
}: {
  businessId: string;
  phone: string | null | undefined;
  classification: ContactClassification;
  customerId?: string | null;
  displayName?: string | null;
  confirmedByOwner?: boolean;
}) {
  const supabase = createAdminClient();
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return;

  const { error } = await supabase.from("caller_contacts").upsert(
    {
      business_id: businessId,
      phone: normalizedPhone,
      classification,
      customer_id: customerId ?? null,
      display_name: displayName ?? null,
      confirmed_by_owner_at: confirmedByOwner ? new Date().toISOString() : null
    },
    { onConflict: "business_id,phone" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function enqueueOwnerContactConfirmation({
  businessId,
  callSessionId,
  owner,
  ownerPhone,
  callerPhone
}: {
  businessId: string;
  callSessionId: string | null;
  owner: RoutingOwner | null;
  ownerPhone: string;
  callerPhone: string | null | undefined;
}) {
  const supabase = createAdminClient();
  const normalizedCallerPhone = normalizePhone(callerPhone);
  if (!normalizedCallerPhone) return;

  const body = `Was ${normalizedCallerPhone} a personal contact? Reply YES to always send to me. Reply NO if this was a business caller.`;
  const dueAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  const { error } = await supabase.from("owner_contact_confirmations").insert({
    business_id: businessId,
    call_session_id: callSessionId,
    owner_user_id: owner?.id ?? null,
    owner_phone: ownerPhone,
    caller_phone: normalizedCallerPhone,
    prompt_body: body,
    due_at: dueAt
  });

  if (error) {
    throw new Error(error.message);
  }
}

export function ownerFirstName(owner: RoutingOwner | null) {
  return owner?.full_name?.trim().split(/\s+/)[0] || "the owner's";
}

export function businessScreeningPrompt(context: RoutingContext) {
  const agentName = context.business.ai_voice_name?.replace(/\s+/g, " ").trim() || "Ana";
  return `Hi, thanks for calling ${context.business.name}. This is ${agentName}. How can I help today?`;
}

export function transferToOwnerTwiml(context: RoutingContext) {
  if (!context.ownerPhone) {
    return '<Response><Say voice="Polly.Joanna" language="en-US">Sorry, I cannot reach the owner right now.</Say><Hangup /></Response>';
  }

  const callerId = context.business.twilio_routing_phone ?? context.business.phone ?? undefined;
  const callerIdAttribute = callerId ? ` callerId="${xmlEscape(callerId)}"` : "";
  return `<Response><Dial${callerIdAttribute}>${xmlEscape(context.ownerPhone)}</Dial></Response>`;
}

export function businessFlowTwiml({
  context,
  callSessionId,
  fromPhone,
  toPhone
}: {
  context: RoutingContext;
  callSessionId: string;
  fromPhone?: string | null;
  toPhone?: string | null;
}) {
  const streamUrl = process.env.OFICIO_VOICE_STREAM_URL;

  if (streamUrl) {
    return [
      "<Response>",
      "<Connect>",
      `<Stream url="${xmlEscape(streamUrl)}">`,
      `<Parameter name="businessId" value="${xmlEscape(context.business.id)}" />`,
      `<Parameter name="callSessionId" value="${xmlEscape(callSessionId)}" />`,
      `<Parameter name="fromPhone" value="${xmlEscape(fromPhone)}" />`,
      `<Parameter name="toPhone" value="${xmlEscape(toPhone)}" />`,
      "</Stream>",
      "</Connect>",
      "</Response>"
    ].join("");
  }

  return [
    "<Response>",
    '<Say voice="Polly.Joanna" language="en-US">Thanks, I will pass that along and someone will follow up shortly.</Say>',
    "<Hangup />",
    "</Response>"
  ].join("");
}

export function classifyScreeningResponse(text: string | null | undefined): ContactClassification {
  const normalized = String(text ?? "").toLowerCase();

  if (/\b(spam|scam|telemarketer|sales call|robocall)\b/.test(normalized)) return "spam";
  if (/\b(no|nope|personal|friend|family|familia|amigo|not business|not about|wrong number)\b/.test(normalized)) return "personal";
  if (
    /\b(yes|service|estimate|quote|price|cost|job|work|yard|lawn|mow|clean|landscap|booking|schedule|available|appointment|customer|cliente|trabajo|precio)\b/.test(
      normalized
    )
  ) {
    return "customer";
  }

  return "unknown";
}
