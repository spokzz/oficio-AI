import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePhoneCustomer, findBusinessRoutingContext, upsertCallerContact } from "@/lib/call-routing";
import { normalizePhone } from "@/lib/phone";
import { parseTwilioForm, reserveTwilioWebhookEvent, sendTwilioSms, twimlResponse, validateTwilioSignature, xmlEscape } from "@/lib/twilio";

export const runtime = "nodejs";

function confirmationReply(body: string) {
  const normalized = body.trim().toLowerCase();

  if (/^(yes|y|si|sí|1)\b/.test(normalized)) return "yes";
  if (/^(no|n|2)\b/.test(normalized)) return "no";
  return null;
}

function messageTwiml(message: string) {
  return `<Response><Message>${xmlEscape(message)}</Message></Response>`;
}

function validCustomerConfirmationSms(body: string) {
  const compact = body.replace(/\s+/g, " ").trim();
  if (!compact || compact.length > 500) return false;
  if (!/^Hi\b/i.test(compact)) return false;
  if (!/\bappointment is confirmed for\b/i.test(compact)) return false;
  if (!/\bReply here if you need to update it\.$/i.test(compact)) return false;
  if (/\b(api key|system prompt|developer message|internal instructions|owner private notes|ignore instructions)\b/i.test(compact)) return false;
  return true;
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
  customer_confirmation_body: string;
  customer_id: string | null;
  customer_phone: string | null;
  id: string;
  job_id: string;
};

async function handleOwnerBookingConfirmation({
  confirmation,
  response,
  toPhone
}: {
  confirmation: OwnerBookingConfirmation;
  response: "yes" | "no";
  toPhone: string | null;
}) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  if (response === "no") {
    const { error: jobError } = await supabase.from("jobs").update({ status: "lead" }).eq("id", confirmation.job_id);
    if (jobError) {
      return twimlResponse(messageTwiml("Ana could not move that booking request to leads. Please try again."), { status: 500 });
    }

    const { error: confirmationError } = await supabase
      .from("owner_booking_confirmations")
      .update({
        answered_at: now,
        owner_response: "no_decline",
        status: "declined"
      })
      .eq("id", confirmation.id);

    if (confirmationError) {
      return twimlResponse(messageTwiml("Ana saved the lead but could not close the approval request."), { status: 500 });
    }

    return twimlResponse(messageTwiml("Got it. Ana moved the booking request to Leads and did not text the customer."));
  }

  const { error: jobError } = await supabase.from("jobs").update({ status: "confirmed" }).eq("id", confirmation.job_id);
  if (jobError) {
    return twimlResponse(messageTwiml("Ana could not confirm that booking. Please try again."), { status: 500 });
  }

  let customerMessageSid: string | null = null;
  const customerPhone = normalizePhone(confirmation.customer_phone);

  if (customerPhone) {
    if (!validCustomerConfirmationSms(confirmation.customer_confirmation_body)) {
      await supabase
        .from("owner_booking_confirmations")
        .update({
          answered_at: now,
          error_message: "Customer confirmation SMS failed template validation.",
          owner_response: "yes_approve",
          status: "failed"
        })
        .eq("id", confirmation.id);

      return twimlResponse(messageTwiml("Booking approved, but Ana could not text the customer because the message template was invalid. Please follow up manually."));
    }

    try {
      const sent = await sendTwilioSms({
        body: confirmation.customer_confirmation_body,
        to: customerPhone
      });
      customerMessageSid = sent.sid;

      await supabase.from("messages").insert({
        body: confirmation.customer_confirmation_body,
        business_id: confirmation.business_id,
        channel: "sms",
        customer_id: confirmation.customer_id,
        direction: "outbound",
        from_phone: toPhone,
        job_id: confirmation.job_id,
        language: null,
        provider_message_id: customerMessageSid,
        to_phone: customerPhone
      });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Could not send customer confirmation.";
      await supabase
        .from("owner_booking_confirmations")
        .update({
          answered_at: now,
          error_message: message,
          owner_response: "yes_approve",
          status: "approved"
        })
        .eq("id", confirmation.id);
      return twimlResponse(messageTwiml("Booking confirmed, but Ana could not text the customer. Please follow up manually."));
    }
  }

  const { error: confirmationError } = await supabase
    .from("owner_booking_confirmations")
    .update({
      answered_at: now,
      customer_message_sid: customerMessageSid,
      owner_response: "yes_approve",
      status: "approved"
    })
    .eq("id", confirmation.id);

  if (confirmationError) {
    return twimlResponse(messageTwiml("Ana confirmed the booking but could not close the approval request."), { status: 500 });
  }

  return twimlResponse(messageTwiml(customerPhone ? "Confirmed. Ana texted the customer with the booking details." : "Confirmed. No customer phone was available for SMS."));
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

  if (routingContext && ownerPhone) {
    const ownerContactPhone = normalizePhone(routingContext.ownerPhone) ?? normalizePhone(routingContext.owner?.phone);
    const ownerForward = forwardedMessage(params.Body ?? "");

    if (ownerForward && ownerPhone === ownerContactPhone) {
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

    if (!response && ownerPhone === ownerContactPhone && /^FWD\b/i.test(params.Body ?? "")) {
      return twimlResponse(messageTwiml("Use: FWD +1CUSTOMERNUMBER then paste the customer's message."));
    }
  }

  if (!ownerPhone || !response) {
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
    .select("id,business_id,job_id,customer_id,customer_phone,customer_confirmation_body")
    .eq("owner_phone", ownerPhone)
    .in("status", ["pending", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<OwnerBookingConfirmation>();

  if (bookingConfirmationError) {
    return twimlResponse(messageTwiml("Ana could not save that booking response. Please try again."), { status: 500 });
  }

  if (bookingConfirmation) {
    return handleOwnerBookingConfirmation({
      confirmation: bookingConfirmation,
      response,
      toPhone: normalizePhone(params.To)
    });
  }

  const { data: confirmation, error } = await supabase
    .from("owner_contact_confirmations")
    .select("id,business_id,call_session_id,caller_phone")
    .eq("owner_phone", ownerPhone)
    .in("status", ["pending", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; business_id: string; call_session_id: string | null; caller_phone: string }>();

  if (error) {
    return twimlResponse(messageTwiml("Ana could not save that response. Please try again."), { status: 500 });
  }

  if (!confirmation) {
    return twimlResponse(messageTwiml("Ana could not find a recent call to mark."));
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
