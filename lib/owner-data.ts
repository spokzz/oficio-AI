import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { todayRange } from "@/lib/format";
import type {
  AiSummary,
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

const SUMMARY_TRANSLATION_MODEL = process.env.OPENAI_TRANSLATION_MODEL || "gpt-5-nano";

function ownerSummaryLanguage(language?: string | null): OwnerDisplayLanguage {
  return String(language || "en").toLowerCase().startsWith("es") ? "es" : "en";
}

function responseOutputText(payload: unknown) {
  if (typeof payload !== "object" || payload === null) return "";
  const response = payload as { output?: Array<{ content?: Array<{ text?: string; type?: string }> }>; output_text?: string };
  if (typeof response.output_text === "string") return response.output_text.trim();

  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
}

function parseJsonArray(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || value;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function translateSummaryBatch(summaries: AiSummary[], language: OwnerDisplayLanguage) {
  if (!summaries.length || !process.env.OPENAI_API_KEY) return new Map<string, SummaryTranslation>();

  const targetLanguage = language === "es" ? "Spanish as used in the United States" : "English";
  const response = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input: [
        {
          content: [
            {
              type: "input_text",
              text: [
                `Translate these owner-facing business summaries into ${targetLanguage}.`,
                "Return only a JSON array. Each item must have id, summary, and action_needed.",
                "Translate all normal human-readable text.",
                "Preserve names, phone numbers, email addresses, URLs, dates, times, prices, service labels, and physical addresses exactly.",
                "Do not add facts. Do not remove facts. Keep each translation concise.",
                JSON.stringify(
                  summaries.map((summary) => ({
                    action_needed: summary.action_needed,
                    id: summary.id,
                    summary: summary.summary
                  }))
                )
              ].join("\n")
            }
          ],
          role: "user"
        }
      ],
      max_output_tokens: 1800,
      model: SUMMARY_TRANSLATION_MODEL,
      store: false
    }),
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
    console.error("Could not translate owner summaries:", payload.error?.message || payload.message || response.status);
    return new Map<string, SummaryTranslation>();
  }

  const payload = await response.json().catch(() => ({}));
  const rows = parseJsonArray(responseOutputText(payload));
  const translations = new Map<string, SummaryTranslation>();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as { action_needed?: unknown; id?: unknown; summary?: unknown };
    const id = typeof item.id === "string" ? item.id : "";
    const summary = typeof item.summary === "string" ? item.summary.trim() : "";
    if (!id || !summary) continue;
    translations.set(id, {
      display_action_needed: typeof item.action_needed === "string" ? item.action_needed.trim() : null,
      display_summary: summary
    });
  }

  return translations;
}

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

async function cacheSummaryTranslations({
  businessId,
  language,
  translations,
  supabase
}: {
  businessId: string;
  language: OwnerDisplayLanguage;
  translations: Map<string, SummaryTranslation>;
  supabase: SupabaseClient;
}) {
  const rows = [...translations.entries()]
    .filter(([, translation]) => Boolean(translation.display_summary))
    .map(([summaryId, translation]) => ({
      action_needed: translation.display_action_needed ?? null,
      ai_summary_id: summaryId,
      business_id: businessId,
      language,
      summary: translation.display_summary as string
    }));

  if (!rows.length) return;

  const { error } = await supabase.from("ai_summary_translations").upsert(rows, { onConflict: "ai_summary_id,language" });
  if (error) console.error("Could not cache summary translations:", error.message);
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
    }
  }

  const missingTranslations = needsTranslation.filter((summary) => !cached.has(summary.id));

  for (let index = 0; index < missingTranslations.length; index += 12) {
    const batch = missingTranslations.slice(index, index + 12);
    const translations = await translateSummaryBatch(batch, language);
    await cacheSummaryTranslations({ businessId, language, supabase, translations });

    for (const summary of batch) {
      const translated = translations.get(summary.id);
      if (translated?.display_summary) {
        summary.display_summary = translated.display_summary;
        summary.display_action_needed = translated.display_action_needed ?? null;
      }
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
    remindersResult
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
      .limit(50)
  ]);

  if (!businessResult.data) redirect("/owner/no-business");

  const jobs = (jobsResult.data ?? []) as Job[];
  const customers = (customersResult.data ?? []) as Customer[];
  const quotes = (quotesResult.data ?? []) as Quote[];
  const calls = (callsResult.data ?? []) as CallSession[];
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
    billing: billingResult.data ?? null,
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
