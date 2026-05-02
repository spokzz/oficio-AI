import { NextResponse } from "next/server";
import {
  businessFlowTwiml,
  classifyScreeningResponse,
  enqueueOwnerContactConfirmation,
  ensurePhoneCustomer,
  findBusinessRoutingContext,
  transferToOwnerTwiml,
  updateCallSessionByProviderId
} from "@/lib/call-routing";
import { normalizePhone } from "@/lib/phone";
import { parseTwilioForm, sayAndHangup, twimlResponse, validateTwilioSignature } from "@/lib/twilio";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const params = await parseTwilioForm(request);

  if (!validateTwilioSignature(request, params)) {
    return new NextResponse("Invalid Twilio signature.", { status: 403 });
  }

  const context = await findBusinessRoutingContext(params.To);
  if (!context) {
    return twimlResponse(sayAndHangup("Sorry, this Oficio AI number is not configured yet."), { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const callSessionId = requestUrl.searchParams.get("callSessionId");
  const callerText = params.SpeechResult || params.Digits || "";
  const classification = classifyScreeningResponse(callerText);

  if (classification === "spam") {
    await updateCallSessionByProviderId(params.CallSid, {
      contact_type: "spam",
      ended_at: new Date().toISOString(),
      outcome: "Unknown caller screened as spam.",
      screening_result: "unknown_spam",
      status: "completed"
    });

    return twimlResponse("<Response><Hangup /></Response>");
  }

  if (classification === "personal" || classification === "vendor") {
    await updateCallSessionByProviderId(params.CallSid, {
      contact_type: classification,
      outcome: "Caller said this is not a business call. Transferred to owner.",
      screening_result: `unknown_${classification}`,
      status: "transferred",
      transferred_to_owner_at: new Date().toISOString()
    });

    if (context.ownerPhone) {
      await enqueueOwnerContactConfirmation({
        businessId: context.business.id,
        callerPhone: normalizePhone(params.From),
        callSessionId,
        owner: context.owner,
        ownerPhone: context.ownerPhone
      });
    }

    return twimlResponse(transferToOwnerTwiml(context));
  }

  if (classification === "customer") {
    const customerId = await ensurePhoneCustomer({
      businessId: context.business.id,
      fromPhone: params.From
    });

    await updateCallSessionByProviderId(params.CallSid, {
      contact_type: "customer",
      customer_id: customerId,
      needs_owner_review: false,
      outcome: "Caller screened as business/customer and sent to Ana business flow.",
      screening_result: "unknown_business"
    });

    return twimlResponse(businessFlowTwiml({ callSessionId: callSessionId ?? params.CallSid, context }));
  }

  await updateCallSessionByProviderId(params.CallSid, {
    outcome: "Caller screening was unclear; transferred to owner.",
    screening_result: "unknown_unclear",
    status: "transferred",
    transferred_to_owner_at: new Date().toISOString()
  });

  if (context.ownerPhone) {
    await enqueueOwnerContactConfirmation({
      businessId: context.business.id,
      callerPhone: normalizePhone(params.From),
      callSessionId,
      owner: context.owner,
      ownerPhone: context.ownerPhone
    });
  }

  return twimlResponse(transferToOwnerTwiml(context));
}
