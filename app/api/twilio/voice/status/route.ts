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
    .select("id,business_id,contact_type,qualified_business_seconds,screening_result,started_at,ended_at")
    .eq("provider_call_id", providerCallId)
    .maybeSingle<{
      id: string;
      business_id: string;
      contact_type: string;
      qualified_business_seconds: number;
      screening_result: string | null;
      started_at: string;
      ended_at: string | null;
    }>();

  if (!call) {
    return NextResponse.json({ ok: true, skipped: "unknown_call" });
  }

  const callbackTime = new Date();
  const explicitDuration = Number(params.CallDuration ?? params.Duration ?? 0);
  const startedAt = new Date(call.started_at);
  const endedAt = call.ended_at ? new Date(call.ended_at) : callbackTime;
  const timestampDuration =
    Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime()) ? 0 : Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  const duration = Number.isFinite(explicitDuration) && explicitDuration > 0 ? Math.round(explicitDuration) : timestampDuration;
  const usedAiReceptionist = !call.screening_result?.startsWith("monthly_limit_");
  const calculatedQualifiedSeconds =
    call.contact_type === "customer" && usedAiReceptionist && Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0;
  const qualifiedSeconds = Math.max(call.qualified_business_seconds, calculatedQualifiedSeconds);

  const { error: updateError } = await supabase
    .from("call_sessions")
    .update({
      ended_at: call.ended_at ?? callbackTime.toISOString(),
      qualified_business_seconds: qualifiedSeconds,
      status: callStatus(params.CallStatus)
    })
    .eq("id", call.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (qualifiedSeconds > 0) {
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

    if (usageError && usageError.code !== "23505") {
      return NextResponse.json({ error: usageError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
