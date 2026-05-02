import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertCallerContact } from "@/lib/call-routing";
import { normalizePhone } from "@/lib/phone";
import { parseTwilioForm, twimlResponse, validateTwilioSignature, xmlEscape } from "@/lib/twilio";

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

export async function POST(request: Request) {
  const params = await parseTwilioForm(request);

  if (!validateTwilioSignature(request, params)) {
    return new NextResponse("Invalid Twilio signature.", { status: 403 });
  }

  const ownerPhone = normalizePhone(params.From);
  const response = confirmationReply(params.Body ?? "");

  if (!ownerPhone || !response) {
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
