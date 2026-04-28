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
      .select("*, customers(full_name, phone, preferred_language)")
      .eq("business_id", businessId)
      .order("scheduled_start", { ascending: true })
      .limit(12),
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
  const quotes = (quotesResult.data ?? []) as Quote[];
  const calls = (callsResult.data ?? []) as CallSession[];
  const { start, end } = todayRange();

  const metrics = {
    totalBookings: jobs.filter((job) => ["pending", "confirmed", "in_progress", "completed"].includes(job.status)).length,
    todayJobs: jobs.filter((job) => job.scheduled_start && job.scheduled_start >= start && job.scheduled_start < end).length,
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
    customers: (customersResult.data ?? []) as Customer[],
    quotes,
    messages: (messagesResult.data ?? []) as Message[],
    calls,
    summaries: (summariesResult.data ?? []) as AiSummary[],
    metrics
  };
}
