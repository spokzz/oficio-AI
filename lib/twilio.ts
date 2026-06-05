import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertProviderEnvironmentSafety } from "@/lib/environment";

export type TwilioForm = Record<string, string>;

export async function parseTwilioForm(request: Request): Promise<TwilioForm> {
  const formData = await request.formData();
  const values: TwilioForm = {};

  for (const [key, value] of formData.entries()) {
    values[key] = String(value);
  }

  return values;
}

export function validateTwilioSignature(request: Request, params: TwilioForm) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;
  assertProviderEnvironmentSafety({
    allowProductionInLocalEnvName: "OFICIO_ALLOW_PRODUCTION_TWILIO_LOCAL",
    provider: "Twilio",
    providerEnvironment: process.env.TWILIO_ENV,
    service: "twilio-webhook"
  });

  const signature = request.headers.get("x-twilio-signature");
  if (!signature) return false;

  const requestUrl = new URL(request.url);
  const publicBaseUrl = process.env.TWILIO_WEBHOOK_BASE_URL;
  const validationUrl = publicBaseUrl
    ? `${publicBaseUrl.replace(/\/$/, "")}${requestUrl.pathname}${requestUrl.search}`
    : request.url;

  const payload = Object.keys(params)
    .sort()
    .reduce((body, key) => `${body}${key}${params[key]}`, validationUrl);
  const expected = crypto.createHmac("sha1", authToken).update(payload).digest("base64");

  return timingSafeEqual(signature, expected);
}

export async function reserveTwilioWebhookEvent(providerEventId: string | null | undefined, route: string) {
  const eventId = String(providerEventId ?? "").trim();
  if (!eventId) return true;

  const supabase = createAdminClient();
  const { error } = await supabase.from("twilio_webhook_events").insert({
    provider_event_id: eventId,
    route
  });

  if (!error) return true;
  if (error.code === "23505") return false;

  throw new Error(error.message);
}

function timingSafeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  if (firstBuffer.length !== secondBuffer.length) return false;
  return crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

export function twimlResponse(twiml: string, init?: ResponseInit) {
  return new NextResponse(twiml, {
    ...init,
    headers: {
      "content-type": "text/xml; charset=utf-8",
      ...init?.headers
    }
  });
}

export function emptyTwiml() {
  return twimlResponse("<Response></Response>");
}

export function xmlEscape(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function sayAndHangup(message: string) {
  return `<Response><Say>${xmlEscape(message)}</Say><Hangup /></Response>`;
}

export async function sendTwilioSms({ to, body }: { to: string; body: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromPhone = process.env.TWILIO_FROM_PHONE;

  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required to send SMS.");
  }
  assertProviderEnvironmentSafety({
    allowProductionInLocalEnvName: "OFICIO_ALLOW_PRODUCTION_TWILIO_LOCAL",
    provider: "Twilio",
    providerEnvironment: process.env.TWILIO_ENV,
    service: "twilio-sms"
  });

  if (!messagingServiceSid && !fromPhone) {
    throw new Error("Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_PHONE to send SMS.");
  }

  const params = new URLSearchParams({
    Body: body,
    To: to
  });

  if (messagingServiceSid) {
    params.set("MessagingServiceSid", messagingServiceSid);
  } else if (fromPhone) {
    params.set("From", fromPhone);
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    body: params,
    headers: {
      authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });

  const payload = (await response.json()) as { sid?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? `Twilio SMS failed with ${response.status}.`);
  }

  return { sid: payload.sid ?? null };
}
