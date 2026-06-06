import { NextResponse } from "next/server";
import { sendDueOwnerDailyAgendas } from "@/lib/daily-owner-agenda";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RecurringCustomer = {
  id: string;
  business_id: string;
  full_name: string;
  recurring_interval_weeks: number | null;
  recurring_service_type: string | null;
  created_at: string;
};

type CustomerJob = {
  customer_id: string | null;
  scheduled_start: string | null;
  status: string;
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.OFICIO_CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dueDateKey(anchor: string, intervalWeeks: number) {
  const due = new Date(anchor);
  if (Number.isNaN(due.getTime())) return null;
  due.setUTCDate(due.getUTCDate() + intervalWeeks * 7);
  return dateKey(due);
}

async function generateRecurringReminders() {
  const supabase = createAdminClient();
  const now = new Date();
  const today = dateKey(now);

  const { data: customers, error: customersError } = await supabase
    .from("customers")
    .select("id,business_id,full_name,recurring_interval_weeks,recurring_service_type,created_at")
    .not("recurring_interval_weeks", "is", null);

  if (customersError) {
    throw new Error(customersError.message);
  }

  const recurringCustomers = ((customers ?? []) as RecurringCustomer[]).filter(
    (customer) => Number(customer.recurring_interval_weeks) > 0
  );
  const customerIds = recurringCustomers.map((customer) => customer.id);

  if (!customerIds.length) {
    return { due: 0, processedCustomers: 0, scheduled: 0, stale: 0 };
  }

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("customer_id,scheduled_start,status")
    .in("customer_id", customerIds)
    .not("scheduled_start", "is", null)
    .neq("status", "canceled");

  if (jobsError) {
    throw new Error(jobsError.message);
  }

  const futureScheduledCustomerIds = new Set<string>();
  const customerLastServiceAt: Record<string, string> = {};

  for (const job of (jobs ?? []) as CustomerJob[]) {
    if (!job.customer_id || !job.scheduled_start) continue;

    const scheduled = new Date(job.scheduled_start);
    if (Number.isNaN(scheduled.getTime())) continue;

    if (scheduled > now) {
      futureScheduledCustomerIds.add(job.customer_id);
      continue;
    }

    const existing = customerLastServiceAt[job.customer_id];
    if (!existing || scheduled.getTime() > new Date(existing).getTime()) {
      customerLastServiceAt[job.customer_id] = job.scheduled_start;
    }
  }

  if (futureScheduledCustomerIds.size) {
    await supabase
      .from("customer_recurring_reminders")
      .update({
        resolved_at: now.toISOString(),
        status: "scheduled"
      })
      .in("customer_id", [...futureScheduledCustomerIds])
      .eq("status", "due");
  }

  const dueRows = [];
  const dueKeys = new Set<string>();

  for (const customer of recurringCustomers) {
    if (futureScheduledCustomerIds.has(customer.id)) continue;

    const intervalWeeks = Number(customer.recurring_interval_weeks);
    const lastServiceAt = customerLastServiceAt[customer.id] ?? null;
    const dueAt = dueDateKey(lastServiceAt ?? customer.created_at, intervalWeeks);
    if (!dueAt || dueAt > today) continue;

    dueKeys.add(`${customer.id}:${dueAt}`);
    dueRows.push({
      business_id: customer.business_id,
      customer_id: customer.id,
      due_at: dueAt,
      generated_at: now.toISOString(),
      interval_weeks: intervalWeeks,
      last_service_at: lastServiceAt,
      resolved_at: null,
      service_type: customer.recurring_service_type,
      status: "due"
    });
  }

  if (dueRows.length) {
    const { error: upsertError } = await supabase
      .from("customer_recurring_reminders")
      .upsert(dueRows, { onConflict: "customer_id,due_at" });

    if (upsertError) {
      throw new Error(upsertError.message);
    }
  }

  const { data: activeDueRows, error: activeDueError } = await supabase
    .from("customer_recurring_reminders")
    .select("id,customer_id,due_at")
    .in("customer_id", customerIds)
    .eq("status", "due");

  if (activeDueError) {
    throw new Error(activeDueError.message);
  }

  const staleIds = (activeDueRows ?? [])
    .filter((row) => !dueKeys.has(`${row.customer_id}:${row.due_at}`) && !futureScheduledCustomerIds.has(String(row.customer_id)))
    .map((row) => row.id as string);

  if (staleIds.length) {
    await supabase
      .from("customer_recurring_reminders")
      .update({
        resolved_at: now.toISOString(),
        status: "stale"
      })
      .in("id", staleIds);
  }

  return {
    due: dueRows.length,
    processedCustomers: recurringCustomers.length,
    scheduled: futureScheduledCustomerIds.size,
    stale: staleIds.length
  };
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const reminders = await generateRecurringReminders();
    const agendas = await sendDueOwnerDailyAgendas();
    return NextResponse.json({ agendas, ok: true, reminders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate reminders." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
