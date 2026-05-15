import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAiCallUsage, sumUsageMinutes } from "@/lib/call-usage";
import { createClient } from "@/lib/supabase/server";
import { todayRange } from "@/lib/format";
import { ownerSummaryLanguage, ownerTranslationConfigured, tryTranslateOwnerText } from "@/lib/summary-translation";
import type {
  AiSummary,
  AiCallUsage,
  Business,
  BusinessAvailabilityException,
  CallSession,
  Customer,
  CustomerRecurringReminder,
  Job,
  ManualBillingAccount,
  Message,
  Quote,
  ServiceRadiusRule,
  UserProfile
} from "@/lib/types";

export type CustomerReminder = {
  id: string;
  customerId: string;
  customerName: string;
  serviceType: string | null;
  intervalWeeks: number;
  dueAt: string;
  lastServiceAt: string | null;
  phone: string | null;
  address: string | null;
};

export type OwnerPortalData = {
  generatedAt: string;
  user: UserProfile;
  business: Business;
  radiusRule: ServiceRadiusRule | null;
  availabilityExceptions: BusinessAvailabilityException[];
  billing: ManualBillingAccount | null;
  aiCallUsage: AiCallUsage;
  jobs: Job[];
  customers: Customer[];
  quotes: Quote[];
  messages: Message[];
  calls: CallSession[];
  summaries: AiSummary[];
  customerServices: Record<string, string>;
  customerLastServiceAt: Record<string, string>;
  customerReminders: CustomerReminder[];
  metrics: {
    totalBookings: number;
    todayJobs: number;
    revenue: number;
    recoveredCalls: number;
    pendingQuotes: number;
  };
};

type OwnerDisplayLanguage = "en" | "es";
type SummaryTranslation = Pick<AiSummary, "display_action_needed" | "display_summary">;
type SummaryTranslationRow = {
  action_needed: string | null;
  ai_summary_id: string;
  language: OwnerDisplayLanguage;
  summary: string;
};

async function cachedSummaryTranslations({
  businessId,
  language,
  summaryIds,
  supabase
}: {
  businessId: string;
  language: OwnerDisplayLanguage;
  summaryIds: string[];
  supabase: SupabaseClient;
}) {
  if (!summaryIds.length) return new Map<string, SummaryTranslation>();

  const { data, error } = await supabase
    .from("ai_summary_translations")
    .select("ai_summary_id,summary,action_needed,language")
    .eq("business_id", businessId)
    .eq("language", language)
    .in("ai_summary_id", summaryIds);

  if (error) {
    console.error("Could not read cached summary translations:", error.message);
    return new Map<string, SummaryTranslation>();
  }

  const translations = new Map<string, SummaryTranslation>();
  for (const row of (data ?? []) as SummaryTranslationRow[]) {
    translations.set(row.ai_summary_id, {
      display_action_needed: row.action_needed,
      display_summary: row.summary
    });
  }

  return translations;
}

async function createSummaryTranslation({
  businessId,
  language,
  summary,
  supabase
}: {
  businessId: string;
  language: OwnerDisplayLanguage;
  summary: AiSummary;
  supabase: SupabaseClient;
}) {
  if (!ownerTranslationConfigured()) return null;

  const [translatedSummary, translatedAction] = await Promise.all([
    tryTranslateOwnerText({ kind: "summary", language, text: summary.summary }),
    summary.action_needed ? tryTranslateOwnerText({ kind: "action item", language, text: summary.action_needed }) : Promise.resolve(null)
  ]);

  if (!translatedSummary) return null;

  const { error } = await supabase.from("ai_summary_translations").upsert(
    {
      action_needed: translatedAction,
      ai_summary_id: summary.id,
      business_id: businessId,
      language,
      summary: translatedSummary
    },
    { onConflict: "ai_summary_id,language" }
  );

  if (error) {
    console.error("Could not cache summary translation:", error.message);
  }

  return {
    display_action_needed: translatedAction,
    display_summary: translatedSummary
  };
}

async function localizeSummaries({
  businessId,
  language,
  summaries,
  supabase
}: {
  businessId: string;
  language: OwnerDisplayLanguage;
  summaries: AiSummary[];
  supabase: SupabaseClient;
}) {
  const localized = summaries.map((summary) => ({
    ...summary,
    display_action_needed: summary.action_needed,
    display_summary: summary.summary
  }));
  const needsTranslation = localized.filter((summary) => ownerSummaryLanguage(summary.summary_language) !== language);
  const cached = await cachedSummaryTranslations({
    businessId,
    language,
    summaryIds: needsTranslation.map((summary) => summary.id),
    supabase
  });

  for (const summary of needsTranslation) {
    const translated = cached.get(summary.id);
    if (translated?.display_summary) {
      summary.display_summary = translated.display_summary;
      summary.display_action_needed = translated.display_action_needed ?? null;
      continue;
    }

    const generated = await createSummaryTranslation({
      businessId,
      language,
      summary,
      supabase
    });

    if (generated?.display_summary) {
      summary.display_summary = generated.display_summary;
      summary.display_action_needed = generated.display_action_needed ?? null;
    }
  }

  return localized;
}

export async function getOwnerPortalData(displayLanguage: OwnerDisplayLanguage = "es"): Promise<OwnerPortalData> {
  const requestTime = new Date();
  const generatedAt = requestTime.toISOString();
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/owner/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id,email,full_name,phone,preferred_language,role")
    .eq("id", user.id)
    .single<UserProfile>();

  if (!profile) redirect("/owner/login");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/owner/no-business");

  const businessId = membership.business_id as string;
  const reminderDueDate = generatedAt.slice(0, 10);
  const monthStart = new Date(requestTime);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

  const [
    businessResult,
    radiusResult,
    billingResult,
    availabilityExceptionsResult,
    jobsResult,
    customersResult,
    quotesResult,
    messagesResult,
    callsResult,
    summariesResult,
    remindersResult,
    usageResult
  ] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", businessId).single<Business>(),
    supabase.from("service_radius_rules").select("*").eq("business_id", businessId).maybeSingle<ServiceRadiusRule>(),
    supabase.from("manual_billing_accounts").select("*").eq("business_id", businessId).maybeSingle<ManualBillingAccount>(),
    supabase
      .from("business_availability_exceptions")
      .select("*")
      .eq("business_id", businessId)
      .gte("ends_on", reminderDueDate)
      .order("starts_on", { ascending: true })
      .limit(100),
    supabase
      .from("jobs")
      .select("*, customers(full_name, phone, preferred_language, address)")
      .eq("business_id", businessId)
      .order("scheduled_start", { ascending: false })
      .limit(200),
    supabase.from("customers").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(200),
    supabase
      .from("quotes")
      .select("*, customers(full_name, phone, preferred_language, address)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("messages")
      .select("*, customers(full_name, phone)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("call_sessions")
      .select("*, customers(full_name, phone)")
      .eq("business_id", businessId)
      .order("started_at", { ascending: false })
      .limit(500),
    supabase
      .from("ai_summaries")
      .select("*, customers(full_name, phone)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("customer_recurring_reminders")
      .select("*, customers(full_name, phone, address)")
      .eq("business_id", businessId)
      .eq("status", "due")
      .lte("due_at", reminderDueDate)
      .order("due_at", { ascending: true })
      .limit(50),
    supabase
      .from("usage_events")
      .select("quantity")
      .eq("business_id", businessId)
      .eq("event_type", "qualified_business_voice")
      .eq("unit", "minute")
      .gte("occurred_at", monthStart.toISOString())
      .lt("occurred_at", nextMonthStart.toISOString())
  ]);

  if (!businessResult.data) redirect("/owner/no-business");

  const jobs = (jobsResult.data ?? []) as Job[];
  const customers = (customersResult.data ?? []) as Customer[];
  const quotes = (quotesResult.data ?? []) as Quote[];
  const calls = (callsResult.data ?? []) as CallSession[];
  const billing = billingResult.data ?? null;
  const aiCallUsage = buildAiCallUsage({
    planName: billing?.plan_name,
    referenceDate: requestTime,
    usedMinutes: sumUsageMinutes((usageResult.data ?? []) as Array<{ quantity: number | string | null }>)
  });
  const customerIds = customers.map((customer) => customer.id);
  const customerServices: Record<string, string> = {};
  const customerLastServiceAt: Record<string, string> = {};

  if (customerIds.length) {
    const { data: customerServiceRows } = await supabase
      .from("jobs")
      .select("customer_id,service_type,created_at")
      .eq("business_id", businessId)
      .in("customer_id", customerIds)
      .not("service_type", "is", null)
      .order("created_at", { ascending: false });

    for (const row of customerServiceRows ?? []) {
      const customerId = row.customer_id as string | null;
      const serviceType = row.service_type as string | null;

      if (customerId && serviceType && !customerServices[customerId]) {
        customerServices[customerId] = serviceType;
      }
    }
  }
  const now = requestTime;

  for (const job of jobs) {
    if (!job.customer_id || !job.scheduled_start || job.status === "canceled") {
      continue;
    }

    const scheduled = new Date(job.scheduled_start);
    if (Number.isNaN(scheduled.getTime())) {
      continue;
    }

    if (scheduled > now) continue;

    const existing = customerLastServiceAt[job.customer_id];
    if (!existing || scheduled.getTime() > new Date(existing).getTime()) {
      customerLastServiceAt[job.customer_id] = job.scheduled_start;
    }
  }

  const customerReminders = ((remindersResult.data ?? []) as CustomerRecurringReminder[]).map<CustomerReminder>((reminder) => ({
    address: reminder.customers?.address ?? null,
    customerId: reminder.customer_id,
    customerName: reminder.customers?.full_name ?? "Customer",
    dueAt: reminder.due_at,
    id: reminder.id,
    intervalWeeks: reminder.interval_weeks,
    lastServiceAt: reminder.last_service_at,
    phone: reminder.customers?.phone ?? null,
    serviceType: reminder.service_type
  }));

  const { start, end } = todayRange();
  const scheduledJobs = jobs.filter((job) => job.scheduled_start && job.status !== "canceled");
  const todayScheduledJobs = scheduledJobs.filter((job) => job.scheduled_start && job.scheduled_start >= start && job.scheduled_start < end);
  const currentMonthCalls = calls.filter((call) => call.started_at >= monthStart.toISOString() && call.started_at < nextMonthStart.toISOString());

  const metrics = {
    totalBookings: todayScheduledJobs.length,
    todayJobs: todayScheduledJobs.length,
    revenue: todayScheduledJobs.reduce((sum, job) => sum + Number(job.final_value ?? job.estimated_value ?? 0), 0),
    recoveredCalls: currentMonthCalls.filter((call) => call.outcome?.toLowerCase().includes("book")).length,
    pendingQuotes: quotes.filter((quote) => quote.status === "needs_owner_approval" || quote.status === "draft").length
  };

  const summaries = await localizeSummaries({
    businessId,
    language: displayLanguage,
    summaries: (summariesResult.data ?? []) as AiSummary[],
    supabase
  });

  return {
    generatedAt,
    user: profile,
    business: businessResult.data,
    radiusRule: radiusResult.data ?? null,
    availabilityExceptions: (availabilityExceptionsResult.data ?? []) as BusinessAvailabilityException[],
    billing,
    aiCallUsage,
    jobs,
    customers,
    quotes,
    messages: (messagesResult.data ?? []) as Message[],
    calls,
    summaries,
    customerServices,
    customerLastServiceAt,
    customerReminders,
    metrics
  };
}
