import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePhoneCustomer, findBusinessRoutingContext, upsertCallerContact } from "@/lib/call-routing";
import { normalizePhone } from "@/lib/phone";
import { businessSmsSender, parseTwilioForm, reserveTwilioWebhookEvent, sendTwilioSms, twimlResponse, validateTwilioSignature, xmlEscape } from "@/lib/twilio";
import { auditContextFromHeaders, recordAuditEvent, type AuditContext } from "@/lib/audit";
import {
  findAuthorizedSmsOwner,
  handleOwnerAssistantSms,
  looksLikeOwnerAssistantRequest,
  unauthorizedOwnerSmsReply
} from "@/lib/owner-sms-assistant";

export const runtime = "nodejs";

function confirmationReply(body: string) {
  const normalized = body.trim().toLowerCase();

  if (/^(yes|y|si|sí|1)\b/.test(normalized)) return "yes";
  if (/^(alt|alternative|otro|otra|3)\b/.test(normalized)) return "alt";
  if (/^(call|callback|llamar|llamada|4)\b/.test(normalized)) return "call";
  if (/^(no|n|2)\b/.test(normalized)) return "no";
  return null;
}

function messageTwiml(message: string) {
  return `<Response><Message>${xmlEscape(message)}</Message></Response>`;
}

function validCustomerBookingResponseSms(body: string, response: "yes" | "alt" | "call" | "no") {
  const compact = body.replace(/\s+/g, " ").trim();
  if (!compact || compact.length > 500) return false;
  if (!/^(Hi|Hola)\b/i.test(compact)) return false;
  if (/\b(api key|system prompt|developer message|internal instructions|owner private notes|ignore instructions)\b/i.test(compact)) return false;

  const expected = {
    alt: /\b(time is not available anymore|horario ya no está disponible)\b/i,
    call: /\b(owner will call you back|dueño le llamará)\b/i,
    no: /\b(appointment time is not confirmed|cita no está confirmada)\b/i,
    yes: /\b(appointment is confirmed for|cita para .+ está confirmada para)\b/i
  };
  return expected[response].test(compact);
}

function forwardedMessage(body: string) {
  const match = body.trim().match(/^FWD\s+(\+?\d[\d\s().-]{7,})\s*\n?([\s\S]+)$/i);
  if (!match) return null;

  const customerPhone = normalizePhone(match[1]);
  const message = match[2]?.trim();

  if (!customerPhone || !message) return null;

  return { customerPhone, message };
}

function ownerSummaryLanguage(language?: string | null) {
  return String(language || "en").toLowerCase().startsWith("es") ? "es" : "en";
}

function shortSummary(message: string, customerPhone: string, language?: string | null) {
  const compact = message.replace(/\s+/g, " ").trim();
  const preview = compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
  if (ownerSummaryLanguage(language) === "es") {
    return `SMS del cliente ${customerPhone}: ${preview}`;
  }

  return `Customer SMS from ${customerPhone}: ${preview}`;
}

function smsActionNeeded(kind: "forwarded" | "inbound", language?: string | null) {
  if (ownerSummaryLanguage(language) === "es") {
    return kind === "forwarded" ? "Revisar SMS reenviado del numero anterior del negocio." : "Revisar mensaje de cliente.";
  }

  return kind === "forwarded" ? "Review forwarded SMS from old business number." : "Customer text needs review.";
}

type OwnerBookingConfirmation = {
  business_id: string;
  call_session_id: string | null;
  customer_alt_body: string | null;
  customer_call_body: string | null;
  customer_confirmation_body: string;
  customer_decline_body: string | null;
  customer_id: string | null;
  customer_language: string | null;
  customer_phone: string | null;
  id: string;
  job_id: string;
};

type BookingOwnerResponse = "yes" | "alt" | "call" | "no";

const bookingResponseConfig = {
  alt: {
    auditAction: "booking_reschedule_requested",
    bodyField: "customer_alt_body",
    confirmationStatus: "reschedule_requested",
    jobStatus: "needs_reschedule",
    ownerResponse: "alt_reschedule",
    successReply: "Ana asked the customer for another day or time."
  },
  call: {
    auditAction: "booking_callback_requested",
    bodyField: "customer_call_body",
    confirmationStatus: "callback_requested",
    jobStatus: "needs_callback",
    ownerResponse: "call_callback",
    successReply: "Ana told the customer you will call to confirm the best time."
  },
  no: {
    auditAction: "booking_not_confirmed",
    bodyField: "customer_decline_body",
    confirmationStatus: "declined",
    jobStatus: "lead_not_confirmed",
    ownerResponse: "no_decline",
    successReply: "Ana kept the request as a lead and sent the customer a polite update."
  },
  yes: {
    auditAction: "booking_approved",
    bodyField: "customer_confirmation_body",
    confirmationStatus: "approved",
    jobStatus: "confirmed",
    ownerResponse: "yes_approve",
    successReply: "Confirmed. Ana texted the customer with the booking details."
  }
} as const;

function customerServiceLabel(serviceType: string | null, language: "en" | "es") {
  const labels: Record<string, [string, string]> = {
    irrigation: ["irrigation", "riego"],
    landscaping: ["landscaping", "paisajismo"],
    mowing: ["lawn mowing", "corte de césped"],
    tree_cutting: ["tree services", "servicios de árboles"],
    yard_cleanup: ["yard cleanup", "limpieza de patio"]
  };
  return labels[String(serviceType ?? "").toLowerCase()]?.[language === "es" ? 1 : 0] ?? (language === "es" ? "servicio" : "service");
}

function fallbackCustomerBookingResponse({
  address,
  agent,
  businessName,
  customerName,
  language,
  response,
  scheduledStart,
  serviceType,
  timeZone
}: {
  address: string | null;
  agent: string | null;
  businessName: string;
  customerName: string | null;
  language: "en" | "es";
  response: BookingOwnerResponse;
  scheduledStart: string | null;
  serviceType: string | null;
  timeZone: string | null;
}) {
  const firstName = String(customerName ?? "").trim().split(/\s+/)[0];
  const safeAgent = String(agent || "Ana").trim() || "Ana";
  const service = customerServiceLabel(serviceType, language);
  const requestedFor = scheduledStart
    ? new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: timeZone || "America/Chicago"
      }).format(new Date(scheduledStart))
    : language === "es"
      ? "el horario solicitado"
      : "the requested time";

  if (language === "es") {
    const greeting = firstName ? `Hola ${firstName}` : "Hola";
    if (response === "yes") {
      return `${greeting}, soy ${safeAgent} de ${businessName}. Su cita para ${service} está confirmada para ${requestedFor}${address ? ` en ${address}` : ""}. Responda aquí si necesita cambiar algo.`;
    }
    if (response === "alt") {
      return `${greeting}, soy ${safeAgent} de ${businessName}. Ese horario ya no está disponible, pero todavía podemos ayudarle. ¿Qué otro día u hora le funciona?`;
    }
    if (response === "call") {
      return `${greeting}, soy ${safeAgent} de ${businessName}. El dueño le llamará para confirmar el mejor horario para su solicitud de ${service}.`;
    }
    return `${greeting}, soy ${safeAgent} de ${businessName}. Recibimos su solicitud para ${service}, pero esa cita no está confirmada. El dueño la revisará y le dará seguimiento si puede ayudarle.`;
  }

  const greeting = firstName ? `Hi ${firstName}` : "Hi";
  if (response === "yes") {
    return `${greeting}, this is ${safeAgent} with ${businessName}. Your ${service} appointment is confirmed for ${requestedFor}${address ? ` at ${address}` : ""}. Reply here if you need to update anything.`;
  }
  if (response === "alt") {
    return `${greeting}, this is ${safeAgent} with ${businessName}. That time is not available anymore, but we can still help. What other day or time works for you?`;
  }
  if (response === "call") {
    return `${greeting}, this is ${safeAgent} with ${businessName}. The owner will call you back to confirm the best time for your ${service} request.`;
  }
  return `${greeting}, this is ${safeAgent} with ${businessName}. We received your ${service} request, but that appointment time is not confirmed. The owner will review it and follow up if they can help.`;
}

async function handleOwnerBookingConfirmation({
  auditContext,
  confirmation,
  response,
  toPhone
}: {
  auditContext: AuditContext;
  confirmation: OwnerBookingConfirmation;
  response: BookingOwnerResponse;
  toPhone: string | null;
}) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const config = bookingResponseConfig[response];
  const [
    { data: beforeJob, error: beforeJobError },
    { data: business },
    { data: customer },
    { data: callSession }
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id,status,scheduled_start,customer_id,service_type,address")
      .eq("id", confirmation.job_id)
      .maybeSingle(),
    supabase
      .from("businesses")
      .select("name,ai_voice_name,booking_time_zone,messaging_service_sid,twilio_routing_phone")
      .eq("id", confirmation.business_id)
      .maybeSingle<{
        ai_voice_name: string | null;
        booking_time_zone: string | null;
        messaging_service_sid: string | null;
        name: string;
        twilio_routing_phone: string | null;
      }>(),
    confirmation.customer_id
      ? supabase
          .from("customers")
          .select("full_name,preferred_language")
          .eq("id", confirmation.customer_id)
          .maybeSingle<{ full_name: string | null; preferred_language: string | null }>()
      : Promise.resolve({ data: null, error: null }),
    confirmation.call_session_id
      ? supabase
          .from("call_sessions")
          .select("detected_language")
          .eq("id", confirmation.call_session_id)
          .maybeSingle<{ detected_language: string | null }>()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (beforeJobError || !beforeJob || !business) {
    return twimlResponse(messageTwiml("Ana could not read that booking request. Please try again."), { status: 500 });
  }

  const { error: jobError } = await supabase.from("jobs").update({ status: config.jobStatus }).eq("id", confirmation.job_id);
  if (jobError) {
    return twimlResponse(messageTwiml("Ana could not update that booking request. Please try again."), { status: 500 });
  }

  let customerMessageSid: string | null = null;
  let deliveryError: string | null = null;
  const customerPhone = normalizePhone(confirmation.customer_phone);
  const language = ownerSummaryLanguage(confirmation.customer_language || callSession?.detected_language || customer?.preferred_language);
  const customerBody =
    confirmation[config.bodyField] ||
    fallbackCustomerBookingResponse({
      address: beforeJob.address,
      agent: business.ai_voice_name,
      businessName: business.name,
      customerName: customer?.full_name ?? null,
      language,
      response,
      scheduledStart: beforeJob.scheduled_start,
      serviceType: beforeJob.service_type,
      timeZone: business.booking_time_zone
    });

  if (customerPhone) {
    if (!customerBody || !validCustomerBookingResponseSms(customerBody, response)) {
      deliveryError = "Customer response SMS failed template validation.";
    } else {
      try {
        const sent = await sendTwilioSms({
          body: customerBody,
          ...businessSmsSender(business),
          to: customerPhone
        });
        customerMessageSid = sent.sid;

        await supabase.from("messages").insert({
          body: customerBody,
          business_id: confirmation.business_id,
          channel: "sms",
          customer_id: confirmation.customer_id,
          direction: "outbound",
          from_phone: sent.from ?? toPhone,
          job_id: confirmation.job_id,
          language: null,
          provider_message_id: customerMessageSid,
          to_phone: customerPhone
        });
      } catch (sendError) {
        deliveryError = sendError instanceof Error ? sendError.message : "Could not send customer booking update.";
      }
    }
  } else {
    deliveryError = "No customer phone was available for SMS.";
  }

  const { error: confirmationError } = await supabase
    .from("owner_booking_confirmations")
    .update({
      answered_at: now,
      customer_message_sid: customerMessageSid,
      error_message: deliveryError,
      owner_response: config.ownerResponse,
      status: config.confirmationStatus
    })
    .eq("id", confirmation.id);

  if (confirmationError) {
    return twimlResponse(messageTwiml("Ana updated the request but could not close the owner approval record."), { status: 500 });
  }

  if (confirmation.call_session_id) {
    await supabase
      .from("call_sessions")
      .update({
        needs_owner_review: false,
        outcome:
          response === "yes"
            ? "Owner approved the requested appointment."
            : response === "alt"
              ? "Owner requested a different appointment time."
              : response === "call"
                ? "Owner will call the customer to confirm a time."
                : "Requested appointment was not confirmed; retained as a lead."
      })
      .eq("id", confirmation.call_session_id);
  }

  await recordAuditEvent(supabase, {
    ...auditContext,
    action: config.auditAction,
    after: {
      customer_message_sid: customerMessageSid,
      error_message: deliveryError,
      owner_response: config.ownerResponse,
      status: config.confirmationStatus
    },
    before: { owner_response: null, status: beforeJob?.status ?? null },
    businessId: confirmation.business_id,
    entityId: confirmation.id,
    entityType: "owner_booking_confirmation"
  });
  if (beforeJob?.status !== config.jobStatus) {
    await recordAuditEvent(supabase, {
      ...auditContext,
      action: "job_status_changed",
      after: { status: config.jobStatus },
      before: { status: beforeJob?.status ?? null },
      businessId: confirmation.business_id,
      entityId: confirmation.job_id,
      entityType: "job"
    });
  }

  if (deliveryError) {
    return twimlResponse(messageTwiml(`Request updated, but Ana could not text the customer: ${deliveryError} Please follow up manually.`));
  }

  return twimlResponse(messageTwiml(config.successReply));
}

export async function POST(request: Request) {
  const params = await parseTwilioForm(request);

  if (!validateTwilioSignature(request, params)) {
    return new NextResponse("Invalid Twilio signature.", { status: 403 });
  }

  const reserved = await reserveTwilioWebhookEvent(params.MessageSid, "sms");
  if (!reserved) {
    return twimlResponse("<Response></Response>");
  }

  const ownerPhone = normalizePhone(params.From);
  const response = confirmationReply(params.Body ?? "");
  const routingContext = await findBusinessRoutingContext(params.To);
  const authorizedOwner =
    routingContext && ownerPhone ? await findAuthorizedSmsOwner(routingContext.business.id, ownerPhone) : null;

  if (routingContext && ownerPhone) {
    const ownerForward = forwardedMessage(params.Body ?? "");

    if (ownerForward && authorizedOwner) {
      const supabase = createAdminClient();
      const customerId = await ensurePhoneCustomer({
        businessId: routingContext.business.id,
        fromPhone: ownerForward.customerPhone
      });

      const { data: message, error: messageError } = await supabase
        .from("messages")
        .insert({
          business_id: routingContext.business.id,
          customer_id: customerId,
          channel: "sms",
          direction: "inbound",
          from_phone: ownerForward.customerPhone,
          to_phone: normalizePhone(params.To),
          body: ownerForward.message,
          provider_message_id: params.MessageSid || null
        })
        .select("id")
        .single<{ id: string }>();

      if (messageError || !message) {
        return twimlResponse(messageTwiml("Ana could not log that forwarded text. Please try again."), { status: 500 });
      }

      const summaryLanguage = ownerSummaryLanguage(routingContext.business.owner_summary_language);
      const summary = shortSummary(ownerForward.message, ownerForward.customerPhone, summaryLanguage);
      await supabase.from("ai_summaries").insert({
        business_id: routingContext.business.id,
        customer_id: customerId,
        message_id: message.id,
        summary_language: summaryLanguage,
        summary,
        action_needed: smsActionNeeded("forwarded", summaryLanguage),
        confidence: 0.7
      });

      return twimlResponse(messageTwiml(`Logged. ${summary}`));
    }

    if (!response && authorizedOwner && /^FWD\b/i.test(params.Body ?? "")) {
      return twimlResponse(messageTwiml("Use: FWD +1CUSTOMERNUMBER then paste the customer's message."));
    }

    if (authorizedOwner && !response) {
      const reply = await handleOwnerAssistantSms({
        auditContext: auditContextFromHeaders(request.headers, "owner_sms", authorizedOwner.id),
        body: params.Body ?? "",
        messageSid: params.MessageSid || null,
        owner: authorizedOwner,
        routingContext
      });
      return twimlResponse(messageTwiml(reply));
    }

    if (!authorizedOwner && looksLikeOwnerAssistantRequest(params.Body ?? "")) {
      await recordAuditEvent(createAdminClient(), {
        ...auditContextFromHeaders(request.headers, "unauthorized_sms"),
        action: "owner_sms_access_denied",
        after: { from_phone: ownerPhone },
        businessId: routingContext.business.id,
        entityType: "owner_sms"
      });
      return twimlResponse(messageTwiml(unauthorizedOwnerSmsReply(params.Body ?? "", routingContext.business.owner_summary_language)));
    }
  }

  if (!ownerPhone || !response || !authorizedOwner || !routingContext) {
    if (routingContext) {
      const supabase = createAdminClient();
      const customerId = await ensurePhoneCustomer({
        businessId: routingContext.business.id,
        fromPhone: params.From
      });

      const { data: message, error: messageError } = await supabase
        .from("messages")
        .insert({
          business_id: routingContext.business.id,
          customer_id: customerId,
          channel: "sms",
          direction: "inbound",
          from_phone: normalizePhone(params.From),
          to_phone: normalizePhone(params.To),
          body: params.Body ?? "",
          provider_message_id: params.MessageSid || null
        })
        .select("id")
        .single<{ id: string }>();

      if (messageError || !message) {
        return twimlResponse(messageTwiml("Ana could not save that text. Please try again."), { status: 500 });
      }

      const summaryLanguage = ownerSummaryLanguage(routingContext.business.owner_summary_language);
      const customerPhone = normalizePhone(params.From) ?? (summaryLanguage === "es" ? "numero desconocido" : "unknown number");
      const summary = shortSummary(params.Body ?? "", customerPhone, summaryLanguage);
      await supabase.from("ai_summaries").insert({
        business_id: routingContext.business.id,
        customer_id: customerId,
        message_id: message.id,
        summary_language: summaryLanguage,
        summary,
        action_needed: smsActionNeeded("inbound", summaryLanguage),
        confidence: 0.7
      });

      if (routingContext.ownerPhone) {
        try {
          await sendTwilioSms({
            body: summary,
            ...businessSmsSender(routingContext.business),
            to: routingContext.ownerPhone
          });
        } catch {
          // Keep the inbound webhook successful even if owner notification delivery fails.
        }
      }
    }

    return twimlResponse("<Response></Response>");
  }

  const supabase = createAdminClient();
  const { data: bookingConfirmation, error: bookingConfirmationError } = await supabase
    .from("owner_booking_confirmations")
    .select(
      "id,business_id,job_id,customer_id,call_session_id,customer_phone,customer_language,customer_confirmation_body,customer_alt_body,customer_call_body,customer_decline_body"
    )
    .eq("owner_phone", ownerPhone)
    .eq("business_id", routingContext.business.id)
    .in("status", ["pending", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<OwnerBookingConfirmation>();

  if (bookingConfirmationError) {
    return twimlResponse(messageTwiml("Ana could not save that booking response. Please try again."), { status: 500 });
  }

  if (bookingConfirmation) {
    return handleOwnerBookingConfirmation({
      auditContext: auditContextFromHeaders(request.headers, "owner_sms"),
      confirmation: bookingConfirmation,
      response,
      toPhone: normalizePhone(params.To)
    });
  }

  const { data: confirmation, error } = await supabase
    .from("owner_contact_confirmations")
    .select("id,business_id,call_session_id,caller_phone")
    .eq("owner_phone", ownerPhone)
    .eq("business_id", routingContext.business.id)
    .in("status", ["pending", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; business_id: string; call_session_id: string | null; caller_phone: string }>();

  if (error) {
    return twimlResponse(messageTwiml("Ana could not save that response. Please try again."), { status: 500 });
  }

  if (!confirmation) {
    const reply = await handleOwnerAssistantSms({
      auditContext: auditContextFromHeaders(request.headers, "owner_sms", authorizedOwner.id),
      body: params.Body ?? "",
      messageSid: params.MessageSid || null,
      owner: authorizedOwner,
      routingContext
    });
    return twimlResponse(messageTwiml(reply));
  }

  if (response !== "yes" && response !== "no") {
    return twimlResponse(messageTwiml("Reply YES or NO for the caller classification request."));
  }

  const contactResponse = response === "yes" ? "yes_personal" : "no_business";

  if (contactResponse === "yes_personal") {
    await upsertCallerContact({
      businessId: confirmation.business_id,
      classification: "personal",
      confirmedByOwner: true,
      phone: confirmation.caller_phone
    });

    if (confirmation.call_session_id) {
      await supabase
        .from("call_sessions")
        .update({
          contact_type: "personal",
          needs_owner_review: false,
          outcome: "Owner confirmed this caller is personal.",
          screening_result: "owner_confirmed_personal"
        })
        .eq("id", confirmation.call_session_id);
    }
  } else {
    await upsertCallerContact({
      businessId: confirmation.business_id,
      classification: "customer",
      confirmedByOwner: true,
      phone: confirmation.caller_phone
    });

    if (confirmation.call_session_id) {
      await supabase
        .from("call_sessions")
        .update({
          contact_type: "customer",
          needs_owner_review: false,
          outcome: "Owner marked this caller as business.",
          screening_result: "owner_marked_business"
        })
        .eq("id", confirmation.call_session_id);
    }
  }

  const { error: updateError } = await supabase
    .from("owner_contact_confirmations")
    .update({
      answered_at: new Date().toISOString(),
      owner_response: contactResponse,
      status: "answered"
    })
    .eq("id", confirmation.id);

  if (updateError) {
    return twimlResponse(messageTwiml("Ana saved the contact but could not close the confirmation."), { status: 500 });
  }

  const reply =
    contactResponse === "yes_personal"
      ? "Got it. Ana will send this number straight to you next time."
      : "Got it. Ana will handle this caller as business next time.";

  return twimlResponse(messageTwiml(reply));
}
