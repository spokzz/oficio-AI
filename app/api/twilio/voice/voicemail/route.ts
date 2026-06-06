import { NextResponse } from "next/server";
import { updateCallSessionByProviderId } from "@/lib/call-routing";
import { parseTwilioForm, twimlResponse, validateTwilioSignature } from "@/lib/twilio";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const params = await parseTwilioForm(request);

  if (!validateTwilioSignature(request, params)) {
    return new NextResponse("Invalid Twilio signature.", { status: 403 });
  }

  if (!params.CallSid) {
    return new NextResponse("CallSid is required.", { status: 400 });
  }

  const duration = Number(params.RecordingDuration ?? 0);
  await updateCallSessionByProviderId(params.CallSid, {
    ended_at: new Date().toISOString(),
    outcome: "Monthly minute limit voicemail recorded for owner follow-up.",
    status: "completed",
    voicemail_recording_duration_seconds: Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : null,
    voicemail_recording_sid: params.RecordingSid || null,
    voicemail_recording_url: params.RecordingUrl || null
  });

  return twimlResponse(
    '<Response><Say voice="Polly.Joanna" language="en-US">Thank you. The owner will follow up.</Say><Hangup /></Response>'
  );
}
