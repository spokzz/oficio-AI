import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayRange } from "@/lib/format";
import type {
  AiSummary,
  Business,
  CallSession,
  Customer,
  Job,
  ManualBillingAccount,
  Message,
  Quote,
  ServiceRadiusRule,
  UserProfile
} from "@/lib/types";

export type OwnerPortalData = {
  user: UserProfile;
  business: Business;
  radiusRule: ServiceRadiusRule | null;
  billing: ManualBillingAccount | null;
  jobs: Job[];
  customers: Customer[];
  quotes: Quote[];
  messages: Message[];
  calls: CallSession[];
  summaries: AiSummary[];
  customerServices: Record<string, string>;
  metrics: {
    totalBookings: number;
    todayJobs: number;
    revenue: number;
    recoveredCalls: number;
    pendingQuotes: number;
  };
};

export async function getOwnerPortalData(): Promise<OwnerPortalData> {
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

  const [
    businessResult,
    radiusResult,
    billingResult,
    jobsResult,
    customersResult,
    quotesResult,
    messagesResult,
    callsResult,
    summariesResult
  ] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", businessId).single<Business>(),
    supabase.from("service_radius_rules").select("*").eq("business_id", businessId).maybeSingle<ServiceRadiusRule>(),
    supabase.from("manual_billing_accounts").select("*").eq("business_id", businessId).maybeSingle<ManualBillingAccount>(),
    supabase
      .from("jobs")
      .select("*, customers(full_name, phone, preferred_language, address)")
      .eq("business_id", businessId)
      .order("scheduled_start", { ascending: false })
      .limit(200),
    supabase.from("customers").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(12),
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
      .limit(8),
    supabase.from("ai_summaries").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(8)
  ]);

  if (!businessResult.data) redirect("/owner/no-business");

  const jobs = (jobsResult.data ?? []) as Job[];
  const customers = (customersResult.data ?? []) as Customer[];
  const quotes = (quotesResult.data ?? []) as Quote[];
  const calls = (callsResult.data ?? []) as CallSession[];
  const customerIds = customers.map((customer) => customer.id);
  const customerServices: Record<string, string> = {};

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
  const { start, end } = todayRange();
  const scheduledJobs = jobs.filter((job) => job.scheduled_start && job.status !== "canceled");

  const metrics = {
    totalBookings: scheduledJobs.length,
    todayJobs: scheduledJobs.filter((job) => job.scheduled_start && job.scheduled_start >= start && job.scheduled_start < end).length,
    revenue: jobs.reduce((sum, job) => sum + Number(job.final_value ?? job.estimated_value ?? 0), 0),
    recoveredCalls: calls.filter((call) => call.outcome?.toLowerCase().includes("book")).length,
    pendingQuotes: quotes.filter((quote) => quote.status === "needs_owner_approval" || quote.status === "draft").length
  };

  return {
    user: profile,
    business: businessResult.data,
    radiusRule: radiusResult.data ?? null,
    billing: billingResult.data ?? null,
    jobs,
    customers,
    quotes,
    messages: (messagesResult.data ?? []) as Message[],
    calls,
    summaries: (summariesResult.data ?? []) as AiSummary[],
    customerServices,
    metrics
  };
}
