import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTwilioForm, validateTwilioSignature } from "@/lib/twilio";

export const runtime = "nodejs";

function callStatus(status: string | undefined) {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "busy" || status === "canceled") return "failed";
  if (status === "no-answer") return "missed";
  return "active";
}

export async function POST(request: Request) {
  const params = await parseTwilioForm(request);

  if (!validateTwilioSignature(request, params)) {
    return new NextResponse("Invalid Twilio signature.", { status: 403 });
  }

  const providerCallId = params.CallSid;
  if (!providerCallId) {
    return NextResponse.json({ error: "CallSid is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: call } = await supabase
    .from("call_sessions")
    .select("id,business_id,contact_type,qualified_business_seconds,screening_result")
    .eq("provider_call_id", providerCallId)
    .maybeSingle<{ id: string; business_id: string; contact_type: string; qualified_business_seconds: number; screening_result: string | null }>();

  if (!call) {
    return NextResponse.json({ ok: true, skipped: "unknown_call" });
  }

  const duration = Number(params.CallDuration ?? params.Duration ?? 0);
  const usedAiReceptionist = !call.screening_result?.startsWith("monthly_limit_");
  const qualifiedSeconds =
    call.contact_type === "customer" && usedAiReceptionist && Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0;

  const { error: updateError } = await supabase
    .from("call_sessions")
    .update({
      ended_at: new Date().toISOString(),
      qualified_business_seconds: qualifiedSeconds,
      status: callStatus(params.CallStatus)
    })
    .eq("id", call.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (qualifiedSeconds > 0 && call.qualified_business_seconds === 0) {
    const { error: usageError } = await supabase.from("usage_events").insert({
      business_id: call.business_id,
      event_type: "qualified_business_voice",
      quantity: qualifiedSeconds / 60,
      unit: "minute",
      source_id: call.id,
      metadata: {
        provider_call_id: providerCallId,
        qualified_seconds: qualifiedSeconds
      }
    });

    if (usageError) {
      return NextResponse.json({ error: usageError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
