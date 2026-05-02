import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePhoneCustomer, findBusinessRoutingContext, upsertCallerContact } from "@/lib/call-routing";
import { normalizePhone } from "@/lib/phone";
import { parseTwilioForm, sendTwilioSms, twimlResponse, validateTwilioSignature, xmlEscape } from "@/lib/twilio";

export const runtime = "nodejs";

function confirmationReply(body: string) {
  const normalized = body.trim().toLowerCase();

  if (/^(yes|y|si|sí|1)\b/.test(normalized)) return "yes_personal";
  if (/^(no|n|2)\b/.test(normalized)) return "no_business";
  return null;
}

function messageTwiml(message: string) {
  return `<Response><Message>${xmlEscape(message)}</Message></Response>`;
}

function forwardedMessage(body: string) {
  const match = body.trim().match(/^FWD\s+(\+?\d[\d\s().-]{7,})\s*\n?([\s\S]+)$/i);
  if (!match) return null;

  const customerPhone = normalizePhone(match[1]);
  const message = match[2]?.trim();

  if (!customerPhone || !message) return null;

  return { customerPhone, message };
}

function shortSummary(message: string, customerPhone: string) {
  const compact = message.replace(/\s+/g, " ").trim();
  const preview = compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
  return `Customer SMS from ${customerPhone}: ${preview}`;
}

export async function POST(request: Request) {
  const params = await parseTwilioForm(request);

  if (!validateTwilioSignature(request, params)) {
    return new NextResponse("Invalid Twilio signature.", { status: 403 });
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

      const summary = shortSummary(ownerForward.message, ownerForward.customerPhone);
      await supabase.from("ai_summaries").insert({
        business_id: routingContext.business.id,
        customer_id: customerId,
        message_id: message.id,
        summary_language: routingContext.business.owner_summary_language ?? "en",
        summary,
        action_needed: "Review forwarded SMS from old business number.",
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

      const customerPhone = normalizePhone(params.From) ?? "unknown number";
      const summary = shortSummary(params.Body ?? "", customerPhone);
      await supabase.from("ai_summaries").insert({
        business_id: routingContext.business.id,
        customer_id: customerId,
        message_id: message.id,
        summary_language: routingContext.business.owner_summary_language ?? "en",
        summary,
        action_needed: "Customer text needs review.",
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

  if (response === "yes_personal") {
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
      owner_response: response,
      status: "answered"
    })
    .eq("id", confirmation.id);

  if (updateError) {
    return twimlResponse(messageTwiml("Ana saved the contact but could not close the confirmation."), { status: 500 });
  }

  const reply =
    response === "yes_personal"
      ? "Got it. Ana will send this number straight to you next time."
      : "Got it. Ana will handle this caller as business next time.";

  return twimlResponse(messageTwiml(reply));
}
