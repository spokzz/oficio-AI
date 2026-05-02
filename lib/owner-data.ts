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

export type CustomerReminder = {
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
  const now = new Date();
  const futureScheduledCustomerIds = new Set<string>();

  for (const job of jobs) {
    if (!job.customer_id || !job.scheduled_start || job.status === "canceled") {
      continue;
    }

    const scheduled = new Date(job.scheduled_start);
    if (Number.isNaN(scheduled.getTime())) {
      continue;
    }

    if (scheduled > now) {
      futureScheduledCustomerIds.add(job.customer_id);
      continue;
    }

    const existing = customerLastServiceAt[job.customer_id];
    if (!existing || scheduled.getTime() > new Date(existing).getTime()) {
      customerLastServiceAt[job.customer_id] = job.scheduled_start;
    }
  }

  const customerReminders = customers
    .map<CustomerReminder | null>((customer) => {
      const intervalWeeks = customer.recurring_interval_weeks;
      if (!intervalWeeks || futureScheduledCustomerIds.has(customer.id)) {
        return null;
      }

      const anchorDate = new Date(customerLastServiceAt[customer.id] ?? customer.created_at);
      if (Number.isNaN(anchorDate.getTime())) {
        return null;
      }

      const dueDate = new Date(anchorDate);
      dueDate.setDate(dueDate.getDate() + intervalWeeks * 7);

      if (dueDate > now) {
        return null;
      }

      return {
        address: customer.address,
        customerId: customer.id,
        customerName: customer.full_name,
        dueAt: dueDate.toISOString(),
        intervalWeeks,
        lastServiceAt: customerLastServiceAt[customer.id] ?? null,
        phone: customer.phone,
        serviceType: customer.recurring_service_type
      };
    })
    .filter((reminder): reminder is CustomerReminder => Boolean(reminder))
    .sort((first, second) => new Date(first.dueAt).getTime() - new Date(second.dueAt).getTime());

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
    customerLastServiceAt,
    customerReminders,
    metrics
  };
}
