import { NextResponse } from "next/server";
import {
  activeAiCallCapacityStatus,
  aiCallAllowanceStatus,
  businessFlowTwiml,
  businessScreeningPrompt,
  createCallSession,
  findBusinessRoutingContext,
  findKnownCaller,
  monthlyLimitVoicemailTwiml,
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

  const allowanceStatus = await aiCallAllowanceStatus(context.business.id);
  const minuteLimitPolicy = context.business.minute_limit_policy ?? "continue_overage";

  if (allowanceStatus.overLimit && minuteLimitPolicy !== "continue_overage") {
    const forwardToOwner = minuteLimitPolicy === "forward_owner";
    await createCallSession({
      businessId: context.business.id,
      contactType: knownCaller.classification,
      customerId: knownCaller.customerId,
      fromPhone: params.From,
      outcome: forwardToOwner
        ? `${allowanceStatus.usage.planName} monthly AI minutes used; call forwarded to owner.`
        : `${allowanceStatus.usage.planName} monthly AI minutes used; caller sent to voicemail.`,
      providerCallId: params.CallSid,
      screeningResult: forwardToOwner ? "monthly_limit_forward_owner" : "monthly_limit_voicemail",
      status: forwardToOwner ? "transferred" : "active",
      toPhone: params.To,
      transferredToOwner: forwardToOwner
    });

    if (forwardToOwner) {
      return twimlResponse(transferToOwnerTwiml(context));
    }

    const voicemailUrl = new URL("/api/twilio/voice/voicemail", process.env.TWILIO_WEBHOOK_BASE_URL ?? request.url);
    return twimlResponse(monthlyLimitVoicemailTwiml(voicemailUrl.toString()));
  }

  const capacityStatus = await activeAiCallCapacityStatus(context.business.id);
  if (!capacityStatus.allowed) {
    await createCallSession({
      businessId: context.business.id,
      contactType: knownCaller.classification,
      customerId: knownCaller.customerId,
      fromPhone: params.From,
      outcome: `Concurrent AI call limit reached (${capacityStatus.activeCalls}/${capacityStatus.limit}).`,
      providerCallId: params.CallSid,
      screeningResult: "concurrent_ai_call_limit_reached",
      status: "completed",
      toPhone: params.To
    });

    return twimlResponse(sayAndHangup("Sorry, Ana is already helping another caller. Please try again in a few minutes."));
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

    return twimlResponse(businessFlowTwiml({ callSessionId, context, fromPhone: params.From, toPhone: params.To }));
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

  if (process.env.OFICIO_VOICE_STREAM_URL) {
    return twimlResponse(businessFlowTwiml({ callSessionId, context, fromPhone: params.From, toPhone: params.To }));
  }

  return twimlResponse(
    [
      "<Response>",
      `<Gather input="speech dtmf" action="${xmlEscape(actionUrl.toString())}" method="POST" timeout="4" speechTimeout="auto">`,
      `<Say voice="Polly.Joanna" language="en-US">${xmlEscape(prompt)}</Say>`,
      "</Gather>",
      `<Redirect method="POST">${xmlEscape(actionUrl.toString())}</Redirect>`,
      "</Response>"
    ].join("")
  );
}
