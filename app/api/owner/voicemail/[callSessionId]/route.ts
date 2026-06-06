import { NextResponse } from "next/server";
import { assertProviderEnvironmentSafety } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ callSessionId: string }> }) {
  const { callSessionId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return new NextResponse("Unauthorized.", { status: 401 });

  const { data: call } = await supabase
    .from("call_sessions")
    .select("business_id,voicemail_recording_url")
    .eq("id", callSessionId)
    .maybeSingle<{ business_id: string; voicemail_recording_url: string | null }>();

  if (!call?.voicemail_recording_url) return new NextResponse("Voicemail not found.", { status: 404 });

  const { data: membership } = await supabase
    .from("business_users")
    .select("id")
    .eq("business_id", call.business_id)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return new NextResponse("Forbidden.", { status: 403 });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return new NextResponse("Twilio recording access is not configured.", { status: 503 });

  assertProviderEnvironmentSafety({
    allowProductionInLocalEnvName: "OFICIO_ALLOW_PRODUCTION_TWILIO_LOCAL",
    provider: "Twilio",
    providerEnvironment: process.env.TWILIO_ENV,
    service: "owner-voicemail-playback"
  });

  const recordingUrl = call.voicemail_recording_url.endsWith(".mp3")
    ? call.voicemail_recording_url
    : `${call.voicemail_recording_url}.mp3`;
  const response = await fetch(recordingUrl, {
    headers: {
      authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`
    }
  });

  if (!response.ok) return new NextResponse("Could not load voicemail.", { status: 502 });

  return new NextResponse(response.body, {
    headers: {
      "cache-control": "private, no-store",
      "content-type": response.headers.get("content-type") ?? "audio/mpeg"
    }
  });
}
