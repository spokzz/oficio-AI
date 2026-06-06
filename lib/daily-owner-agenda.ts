import { recordAuditEvent } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessSmsSender, sendTwilioSms } from "@/lib/twilio";

type Language = "en" | "es";

type AgendaBusiness = {
  booking_time_zone: string | null;
  id: string;
  messaging_service_sid: string | null;
  name: string;
  owner_summary_language: string | null;
  twilio_routing_phone: string | null;
};

type AgendaOwner = {
  full_name: string | null;
  id: string;
  phone: string | null;
};

type AgendaJob = {
  address: string | null;
  customers:
    | { address: string | null; full_name: string | null; phone: string | null }
    | Array<{ address: string | null; full_name: string | null; phone: string | null }>
    | null;
  scheduled_start: string;
  service_type: string | null;
  status: string;
};

type AgendaReminder = {
  customers: { full_name: string | null } | Array<{ full_name: string | null }> | null;
  due_at: string;
  service_type: string | null;
};

type AgendaAttention = {
  callbackCount: number;
  missingAddressNames: string[];
  missingPhoneNames: string[];
  missingPhotoQuoteCount: number;
  pendingApprovalCount: number;
  pendingBookingCount: number;
  pendingQuoteCount: number;
  recurringReminderCount: number;
};

type AgendaData = {
  attention: AgendaAttention;
  jobs: AgendaJob[];
  newLeadCount: number;
};

function configuredAgendaHour() {
  const value = Number(process.env.OWNER_DAILY_AGENDA_HOUR ?? 5);
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : 5;
}

function hourlyAgendaDispatchEnabled() {
  return String(process.env.OWNER_DAILY_AGENDA_DISPATCH_MODE ?? "daily").toLowerCase() === "hourly";
}

function languageFrom(value?: string | null): Language {
  return String(value ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

function zonedParts(date: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    month: "2-digit",
    timeZone,
    year: "numeric"
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour)
  };
}

function addCalendarDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function localDateTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute || 0, 0);
  let utc = target;

  for (let index = 0; index < 3; index += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric"
    })
      .formatToParts(new Date(utc))
      .reduce<Record<string, string>>((values, part) => {
        values[part.type] = part.value;
        return values;
      }, {});
    const rendered = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), 0);
    utc -= rendered - target;
  }

  return new Date(utc);
}

function dateKeyInZone(date: Date, timeZone: string) {
  return zonedParts(date, timeZone).dateKey;
}

function relationOne<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function serviceLabel(service: string | null, language: Language) {
  const normalized = String(service ?? "").toLowerCase();
  const labels: Record<string, [string, string]> = {
    irrigation: ["irrigation", "riego"],
    landscaping: ["landscaping", "jardinería"],
    mowing: ["lawn mowing", "corte de césped"],
    tree_cutting: ["tree cutting", "corte de árboles"],
    yard_cleanup: ["yard cleanup", "limpieza de jardín"]
  };
  return labels[normalized]?.[language === "es" ? 1 : 0] ?? (normalized.replaceAll("_", " ") || (language === "es" ? "servicio" : "service"));
}

function compact(value: string | null | undefined, max: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function localTime(value: string, language: Language, timeZone: string) {
  return new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone
  }).format(new Date(value));
}

function displayDate(dateKey: string, language: Language) {
  return new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", {
    dateStyle: "full",
    timeZone: "UTC"
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

function dashboardLink() {
  const configured = process.env.OWNER_DASHBOARD_URL?.trim();
  if (configured) return configured;
  const origin = process.env.OFICIO_NEXT_APP_ORIGIN?.trim().replace(/\/$/, "");
  return origin ? `${origin}/owner` : "https://theoficio.com/owner";
}

function countLine(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function attentionItems(attention: AgendaAttention, language: Language) {
  const items: string[] = [];
  const names = (values: string[]) => values.slice(0, 2).map((value) => compact(value, 45));

  if (attention.pendingApprovalCount) {
    items.push(
      language === "es"
        ? countLine(attention.pendingApprovalCount, "solicitud espera tu aprobación", "solicitudes esperan tu aprobación")
        : countLine(attention.pendingApprovalCount, "booking request needs approval", "booking requests need approval")
    );
  }

  if (attention.missingAddressNames.length === 1) {
    items.push(
      language === "es"
        ? `${names(attention.missingAddressNames)[0]} no tiene dirección`
        : `${names(attention.missingAddressNames)[0]} is missing an address`
    );
  } else if (attention.missingAddressNames.length > 1) {
    items.push(
      language === "es"
        ? countLine(attention.missingAddressNames.length, "trabajo no tiene dirección", "trabajos no tienen dirección")
        : countLine(attention.missingAddressNames.length, "job is missing an address", "jobs are missing addresses")
    );
  }

  if (attention.missingPhoneNames.length === 1) {
    items.push(
      language === "es"
        ? `${names(attention.missingPhoneNames)[0]} no tiene teléfono`
        : `${names(attention.missingPhoneNames)[0]} is missing a phone number`
    );
  } else if (attention.missingPhoneNames.length > 1) {
    items.push(
      language === "es"
        ? countLine(attention.missingPhoneNames.length, "cliente no tiene teléfono", "clientes no tienen teléfono")
        : countLine(attention.missingPhoneNames.length, "customer is missing a phone number", "customers are missing phone numbers")
    );
  }

  if (attention.callbackCount) {
    items.push(
      language === "es"
        ? countLine(attention.callbackCount, "cliente necesita devolución de llamada", "clientes necesitan devolución de llamada")
        : countLine(attention.callbackCount, "customer needs a callback", "customers need callbacks")
    );
  }

  if (attention.missingPhotoQuoteCount) {
    items.push(
      language === "es"
        ? countLine(attention.missingPhotoQuoteCount, "solicitud de cotización no tiene fotos", "solicitudes de cotización no tienen fotos")
        : countLine(attention.missingPhotoQuoteCount, "quote request is missing photos", "quote requests are missing photos")
    );
  }

  if (attention.pendingQuoteCount) {
    items.push(
      language === "es"
        ? countLine(attention.pendingQuoteCount, "cotización necesita revisión", "cotizaciones necesitan revisión")
        : countLine(attention.pendingQuoteCount, "quote needs review", "quotes need review")
    );
  }

  if (attention.pendingBookingCount && !attention.pendingApprovalCount) {
    items.push(
      language === "es"
        ? countLine(attention.pendingBookingCount, "solicitud de cita no está confirmada", "solicitudes de cita no están confirmadas")
        : countLine(attention.pendingBookingCount, "booking request is not confirmed", "booking requests are not confirmed")
    );
  }

  if (attention.recurringReminderCount) {
    items.push(
      language === "es"
        ? countLine(attention.recurringReminderCount, "servicio recurrente está pendiente", "servicios recurrentes están pendientes")
        : countLine(attention.recurringReminderCount, "recurring service is due", "recurring services are due")
    );
  }

  return items.slice(0, 3);
}

function agendaBody({
  attention,
  dateKey,
  jobs,
  language,
  newLeadCount,
  timeZone
}: {
  attention: AgendaAttention;
  dateKey: string;
  jobs: AgendaJob[];
  language: Language;
  newLeadCount: number;
  timeZone: string;
}) {
  const link = dashboardLink();
  const items = attentionItems(attention, language);
  const jobLines = jobs.slice(0, 5).map((job) => {
    const customer = relationOne(job.customers)?.full_name || (language === "es" ? "Cliente" : "Customer");
    return `${localTime(job.scheduled_start, language, timeZone)} — ${compact(customer, 42)}, ${serviceLabel(job.service_type, language)}`;
  });
  const lines: string[] = [];

  if (!jobs.length) {
    lines.push(language === "es" ? "Buenos días — no hay trabajos programados para hoy." : "Good morning — no jobs are scheduled for today.");
  } else {
    lines.push(
      language === "es"
        ? `Buenos días — este es tu horario para hoy, ${displayDate(dateKey, language)}.`
        : `Good morning — here’s your schedule for today, ${displayDate(dateKey, language)}.`
    );
    lines.push("");
    lines.push(language === "es" ? `Trabajos hoy: ${jobs.length}` : `Jobs today: ${jobs.length}`);
    if (jobs.length > 5) {
      lines.push(language === "es" ? "Mostrando los primeros 5:" : "Showing first 5:");
    } else {
      lines.push("");
      lines.push(language === "es" ? "Trabajos de hoy:" : "Today’s jobs:");
    }
    lines.push("");
    lines.push(...jobLines);
  }

  if (jobs.length > 5) {
    lines.push("");
    lines.push(
      language === "es"
        ? `${jobs.length - 5} trabajos más en el panel: ${link}`
        : `${jobs.length - 5} more jobs in dashboard: ${link}`
    );
    return compact(lines.join("\n"), 1450);
  }

  lines.push("");
  lines.push(language === "es" ? "Necesita atención:" : "Needs attention:");
  lines.push("");
  lines.push(...(items.length ? items : [language === "es" ? "Nada urgente" : "Nothing urgent"]));
  lines.push("");
  lines.push(language === "es" ? `Nuevos clientes potenciales: ${newLeadCount}` : `New leads: ${newLeadCount}`);
  lines.push("");
  lines.push(language === "es" ? `Abrir panel: ${link}` : `Open dashboard: ${link}`);
  return compact(lines.join("\n"), 1450);
}

async function businessOwners(businessId: string) {
  const supabase = createAdminClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("business_users")
    .select("user_id")
    .eq("business_id", businessId)
    .eq("role", "owner");
  if (membershipError) throw new Error(membershipError.message);
  const ownerIds = (memberships ?? []).map((membership) => String(membership.user_id));
  if (!ownerIds.length) return [];

  const { data: owners, error: ownersError } = await supabase
    .from("users")
    .select("id,full_name,phone")
    .in("id", ownerIds)
    .eq("role", "owner");
  if (ownersError) throw new Error(ownersError.message);
  return (owners ?? []) as AgendaOwner[];
}

async function businessAgenda(businessId: string, dateKey: string, timeZone: string, referenceDate: Date): Promise<AgendaData> {
  const supabase = createAdminClient();
  const broadStart = new Date(`${addCalendarDays(dateKey, -1)}T00:00:00.000Z`).toISOString();
  const broadEnd = new Date(`${addCalendarDays(dateKey, 2)}T00:00:00.000Z`).toISOString();
  const agendaHour = configuredAgendaHour().toString().padStart(2, "0");
  const leadWindowStart = hourlyAgendaDispatchEnabled()
    ? localDateTimeToUtc(addCalendarDays(dateKey, -1), `${agendaHour}:00`, timeZone).toISOString()
    : new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const leadWindowEnd = hourlyAgendaDispatchEnabled()
    ? localDateTimeToUtc(dateKey, `${agendaHour}:00`, timeZone).toISOString()
    : referenceDate.toISOString();
  const [
    { data: jobRows, error: jobsError },
    { data: reminderRows, error: remindersError },
    { data: leadRows, error: leadsError },
    { data: approvalRows, error: approvalsError },
    { data: callbackRows, error: callbacksError },
    { data: quoteRows, error: quotesError }
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("scheduled_start,service_type,status,address,customers(full_name,phone,address)")
      .eq("business_id", businessId)
      .in("status", ["pending", "confirmed", "in_progress"])
      .gte("scheduled_start", broadStart)
      .lt("scheduled_start", broadEnd)
      .order("scheduled_start", { ascending: true })
      .limit(100),
    supabase
      .from("customer_recurring_reminders")
      .select("due_at,service_type,customers(full_name)")
      .eq("business_id", businessId)
      .eq("status", "due")
      .lte("due_at", dateKey)
      .order("due_at", { ascending: true })
      .limit(100),
    supabase
      .from("jobs")
      .select("id")
      .eq("business_id", businessId)
      .eq("status", "lead")
      .gte("created_at", leadWindowStart)
      .lt("created_at", leadWindowEnd)
      .limit(500),
    supabase
      .from("owner_booking_confirmations")
      .select("id")
      .eq("business_id", businessId)
      .in("status", ["pending", "sent"])
      .limit(500),
    supabase
      .from("call_sessions")
      .select("id")
      .eq("business_id", businessId)
      .eq("needs_owner_review", true)
      .limit(500),
    supabase
      .from("quotes")
      .select("id,status,photo_urls")
      .eq("business_id", businessId)
      .in("status", ["draft", "needs_owner_approval"])
      .limit(500)
  ]);
  if (jobsError) throw new Error(jobsError.message);
  if (remindersError) throw new Error(remindersError.message);
  if (leadsError) throw new Error(leadsError.message);
  if (approvalsError) throw new Error(approvalsError.message);
  if (callbacksError) throw new Error(callbacksError.message);
  if (quotesError) throw new Error(quotesError.message);

  const jobs = (jobRows ?? [])
    .filter((job) => job.scheduled_start && dateKeyInZone(new Date(job.scheduled_start), timeZone) === dateKey) as unknown as AgendaJob[];
  const missingAddressNames: string[] = [];
  const missingPhoneNames: string[] = [];

  for (const job of jobs) {
    const customer = relationOne(job.customers);
    const customerName = customer?.full_name || "Customer";
    if (!job.address && !customer?.address) missingAddressNames.push(customerName);
    if (!normalizePhone(customer?.phone)) missingPhoneNames.push(customerName);
  }

  return {
    attention: {
      callbackCount: callbackRows?.length ?? 0,
      missingAddressNames,
      missingPhoneNames,
      missingPhotoQuoteCount: (quoteRows ?? []).filter((quote) => !quote.photo_urls?.length).length,
      pendingApprovalCount: approvalRows?.length ?? 0,
      pendingBookingCount: jobs.filter((job) => job.status === "pending").length,
      pendingQuoteCount: quoteRows?.length ?? 0,
      recurringReminderCount: ((reminderRows ?? []) as unknown as AgendaReminder[]).length
    },
    jobs,
    newLeadCount: leadRows?.length ?? 0
  };
}

async function reserveDelivery({
  body,
  businessId,
  dateKey,
  language,
  ownerId,
  ownerPhone,
  timeZone
}: {
  body: string;
  businessId: string;
  dateKey: string;
  language: Language;
  ownerId: string;
  ownerPhone: string;
  timeZone: string;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("owner_daily_agenda_deliveries")
    .insert({
      agenda_date: dateKey,
      business_id: businessId,
      language,
      message_body: body,
      owner_phone: ownerPhone,
      owner_user_id: ownerId,
      status: "pending",
      time_zone: timeZone
    })
    .select("id")
    .single<{ id: string }>();

  if (error?.code === "23505") return null;
  if (error || !data) throw new Error(error?.message ?? "Could not reserve daily agenda delivery.");
  return data.id;
}

export async function sendDueOwnerDailyAgendas(referenceDate = new Date()) {
  const supabase = createAdminClient();
  const { data: businessRows, error: businessesError } = await supabase
    .from("businesses")
    .select("id,name,status,booking_time_zone,owner_summary_language,messaging_service_sid,twilio_routing_phone")
    .in("status", ["onboarding", "live", "needs_review"]);
  if (businessesError) throw new Error(businessesError.message);

  const result = {
    businessesChecked: 0,
    failed: 0,
    ownersSkipped: 0,
    sent: 0
  };

  for (const business of (businessRows ?? []) as AgendaBusiness[]) {
    const timeZone = business.booking_time_zone || "America/Chicago";
    const local = zonedParts(referenceDate, timeZone);
    if (hourlyAgendaDispatchEnabled() && local.hour !== configuredAgendaHour()) continue;
    result.businessesChecked += 1;

    const language = languageFrom(business.owner_summary_language);
    const [{ attention, jobs, newLeadCount }, owners] = await Promise.all([
      businessAgenda(business.id, local.dateKey, timeZone, referenceDate),
      businessOwners(business.id)
    ]);
    const body = agendaBody({
      attention,
      dateKey: local.dateKey,
      jobs,
      language,
      newLeadCount,
      timeZone
    });

    for (const owner of owners) {
      const ownerPhone = normalizePhone(owner.phone);
      if (!ownerPhone) {
        result.ownersSkipped += 1;
        continue;
      }

      const deliveryId = await reserveDelivery({
        body,
        businessId: business.id,
        dateKey: local.dateKey,
        language,
        ownerId: owner.id,
        ownerPhone,
        timeZone
      });
      if (!deliveryId) {
        result.ownersSkipped += 1;
        continue;
      }

      try {
        const sent = await sendTwilioSms({
          body,
          ...businessSmsSender(business),
          to: ownerPhone
        });
        const sentAt = new Date().toISOString();
        await supabase
          .from("owner_daily_agenda_deliveries")
          .update({
            provider_message_id: sent.sid,
            sent_at: sentAt,
            status: "sent"
          })
          .eq("id", deliveryId);
        await supabase.from("owner_sms_history").insert({
          body,
          business_id: business.id,
          direction: "outbound",
          language,
          owner_phone: ownerPhone,
          owner_user_id: owner.id,
          provider_message_id: sent.sid
        });
        await recordAuditEvent(supabase, {
          action: "owner_daily_agenda_sent",
          actorRole: "system_cron",
          actorUserId: owner.id,
          after: {
            agenda_date: local.dateKey,
            booking_count: jobs.length,
            new_lead_count: newLeadCount,
            to_phone: ownerPhone
          },
          businessId: business.id,
          entityId: deliveryId,
          entityType: "owner_daily_agenda"
        });
        result.sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not send daily agenda.";
        await supabase
          .from("owner_daily_agenda_deliveries")
          .update({
            error_message: compact(message, 500),
            status: "failed"
          })
          .eq("id", deliveryId);
        result.failed += 1;
      }
    }
  }

  return result;
}
