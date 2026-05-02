import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTwilioSms } from "@/lib/twilio";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.OFICIO_CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: confirmations, error } = await supabase
    .from("owner_contact_confirmations")
    .select("id,call_session_id,owner_phone,prompt_body")
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ id: string; status: "sent" | "failed"; messageSid?: string | null; error?: string }> = [];

  for (const confirmation of confirmations ?? []) {
    try {
      const sent = await sendTwilioSms({
        body: String(confirmation.prompt_body),
        to: String(confirmation.owner_phone)
      });

      const sentAt = new Date().toISOString();
      await supabase
        .from("owner_contact_confirmations")
        .update({
          provider_message_id: sent.sid,
          sent_at: sentAt,
          status: "sent"
        })
        .eq("id", confirmation.id);

      if (confirmation.call_session_id) {
        await supabase
          .from("call_sessions")
          .update({
            owner_confirmation_message_sid: sent.sid,
            owner_confirmation_sent_at: sentAt
          })
          .eq("id", confirmation.call_session_id);
      }

      results.push({ id: String(confirmation.id), messageSid: sent.sid, status: "sent" });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Could not send owner confirmation.";
      await supabase
        .from("owner_contact_confirmations")
        .update({
          error_message: message,
          status: "failed"
        })
        .eq("id", confirmation.id);

      results.push({ error: message, id: String(confirmation.id), status: "failed" });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
