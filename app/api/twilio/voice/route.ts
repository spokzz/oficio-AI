import { NextResponse } from "next/server";
import {
  businessFlowTwiml,
  businessScreeningPrompt,
  createCallSession,
  findBusinessRoutingContext,
  findKnownCaller,
  transferToOwnerTwiml
} from "@/lib/call-routing";
import { parseTwilioForm, sayAndHangup, twimlResponse, validateTwilioSignature, xmlEscape } from "@/lib/twilio";

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

  const knownCaller = await findKnownCaller(context.business.id, params.From);

  if (knownCaller.classification === "spam") {
    await createCallSession({
      businessId: context.business.id,
      contactType: "spam",
      fromPhone: params.From,
      outcome: "Known spam caller blocked.",
      providerCallId: params.CallSid,
      screeningResult: "known_spam",
      status: "completed",
      toPhone: params.To
    });

    return twimlResponse('<Response><Reject reason="rejected" /></Response>');
  }

  if (knownCaller.classification === "personal" || knownCaller.classification === "vendor") {
    await createCallSession({
      businessId: context.business.id,
      contactType: knownCaller.classification,
      fromPhone: params.From,
      outcome: `Known ${knownCaller.classification} caller transferred to owner.`,
      providerCallId: params.CallSid,
      screeningResult: `known_${knownCaller.classification}`,
      status: "transferred",
      toPhone: params.To,
      transferredToOwner: true
    });

    return twimlResponse(transferToOwnerTwiml(context));
  }

  if (knownCaller.classification === "customer") {
    const callSessionId = await createCallSession({
      businessId: context.business.id,
      contactType: "customer",
      customerId: knownCaller.customerId,
      fromPhone: params.From,
      outcome: "Known customer sent to Ana business flow.",
      providerCallId: params.CallSid,
      screeningResult: "known_customer",
      toPhone: params.To
    });

    return twimlResponse(businessFlowTwiml({ callSessionId, context }));
  }

  const callSessionId = await createCallSession({
    businessId: context.business.id,
    contactType: "unknown",
    fromPhone: params.From,
    needsOwnerReview: true,
    outcome: "Unknown caller is being screened by Ana.",
    providerCallId: params.CallSid,
    screeningResult: "unknown_screening_started",
    toPhone: params.To
  });

  const actionUrl = new URL("/api/twilio/voice/screen", process.env.TWILIO_WEBHOOK_BASE_URL ?? request.url);
  actionUrl.searchParams.set("callSessionId", callSessionId);
  const prompt = businessScreeningPrompt(context);

  return twimlResponse(
    [
      "<Response>",
      `<Gather input="speech dtmf" action="${xmlEscape(actionUrl.toString())}" method="POST" timeout="4" speechTimeout="auto">`,
      `<Say>${xmlEscape(prompt)}</Say>`,
      "</Gather>",
      `<Redirect method="POST">${xmlEscape(actionUrl.toString())}</Redirect>`,
      "</Response>"
    ].join("")
  );
}
