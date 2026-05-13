import fs from "node:fs";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import WebSocket, { WebSocketServer } from "ws";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;

  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const SERVICE_OPTIONS = ["landscaping", "mowing", "tree_cutting", "yard_cleanup", "irrigation"];
const CUSTOMER_SOURCE_OPTIONS = ["referral", "facebook", "google", "website", "instagram", "other"];
const BUSINESS_DAY_OPTIONS = [
  { aliases: ["monday", "mon"], label: "Monday" },
  { aliases: ["tuesday", "tue", "tues"], label: "Tuesday" },
  { aliases: ["wednesday", "wed"], label: "Wednesday" },
  { aliases: ["thursday", "thu", "thur", "thurs"], label: "Thursday" },
  { aliases: ["friday", "fri"], label: "Friday" },
  { aliases: ["saturday", "sat"], label: "Saturday" },
  { aliases: ["sunday", "sun"], label: "Sunday" }
];
const DEFAULT_TIME_ZONE = process.env.OFICIO_BOOKING_TIME_ZONE || "America/Chicago";
const DEFAULT_SLOT_MINUTES = Number(process.env.OFICIO_BOOKING_SLOT_MINUTES || 120);
const SLOT_STEP_MINUTES = Number(process.env.OFICIO_BOOKING_SLOT_STEP_MINUTES || 60);
const WORKDAY_START_HOUR = Number(process.env.OFICIO_BOOKING_DAY_START_HOUR || 8);
const WORKDAY_END_HOUR = Number(process.env.OFICIO_BOOKING_DAY_END_HOUR || 17);
const OPENAI_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";
const OPENAI_VOICE = process.env.OPENAI_REALTIME_VOICE || "marin";
const PORT = Number(process.env.OFICIO_VOICE_GATEWAY_PORT || 8787);
const NEXT_APP_ORIGIN = process.env.OFICIO_NEXT_APP_ORIGIN || "http://localhost:3000";
const GEOCODIO_ENDPOINT = "https://api.geocod.io/v1.9/geocode";
const BUSINESS_HOURS_TEXT =
  process.env.OFICIO_BUSINESS_HOURS_TEXT ||
  `Monday through Friday, ${String(WORKDAY_START_HOUR)}:00 AM to ${WORKDAY_END_HOUR > 12 ? WORKDAY_END_HOUR - 12 : WORKDAY_END_HOUR}:00 PM`;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function supabaseAdmin() {
  return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return value?.startsWith("+") ? value : `+${digits}`;
}

function isServiceOption(value) {
  return SERVICE_OPTIONS.includes(value);
}

function isCustomerSourceOption(value) {
  return CUSTOMER_SOURCE_OPTIONS.includes(value);
}

function normalizeCustomerSource(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return "other";
  if (text.includes("facebook")) return "facebook";
  if (text.includes("google")) return "google";
  if (text.includes("instagram")) return "instagram";
  if (text.includes("website") || text.includes("web site") || text.includes("online")) return "website";
  if (
    text.includes("referral") ||
    text.includes("referred") ||
    text.includes("friend") ||
    text.includes("neighbor") ||
    text.includes("family") ||
    text.includes("word of mouth")
  ) {
    return "referral";
  }
  return isCustomerSourceOption(text) ? text : "other";
}

function numericCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function geocodioApiKey() {
  return process.env.GEOCODIO_API_KEY?.trim().replace(/;+$/, "");
}

function distanceMiles(origin, destination) {
  const earthRadiusMiles = 3958.7613;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(destination.lat - origin.lat);
  const lngDelta = toRadians(destination.lng - origin.lng);
  const originLat = toRadians(origin.lat);
  const destinationLat = toRadians(destination.lat);
  const haversine =
    Math.sin(latDelta / 2) ** 2 + Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function businessServiceOptions(business) {
  const selected = Array.isArray(business?.available_services) ? business.available_services.filter(isServiceOption) : [];
  return selected.length ? [...new Set(selected)] : SERVICE_OPTIONS;
}

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function safeParseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return fallback;
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function proxyHeaders(request) {
  const headers = {};
  const omittedHeaders = new Set(["connection", "content-length", "host", "upgrade"]);

  for (const [key, value] of Object.entries(request.headers)) {
    if (omittedHeaders.has(key) || value === undefined) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  headers["x-forwarded-host"] = request.headers.host || "";
  headers["x-forwarded-proto"] = "https";

  return headers;
}

async function proxyTwilioApiRequest(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  const targetUrl = new URL(`${url.pathname}${url.search}`, NEXT_APP_ORIGIN);

  try {
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readRequestBody(request);
    const proxied = await fetch(targetUrl, {
      body,
      headers: proxyHeaders(request),
      method: request.method
    });

    const responseBody = Buffer.from(await proxied.arrayBuffer());
    response.writeHead(proxied.status, {
      "cache-control": proxied.headers.get("cache-control") || "no-store",
      "content-type": proxied.headers.get("content-type") || "text/plain; charset=utf-8"
    });
    response.end(responseBody);
  } catch (error) {
    console.error(`Could not proxy Twilio API request to ${targetUrl}:`, error);
    response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Next.js app is not reachable from the voice gateway." }));
  }
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function localDateTimeToUtc(date, time, timeZone = DEFAULT_TIME_ZONE) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute || 0, 0);
  let utc = target;

  for (let index = 0; index < 3; index += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric"
    })
      .formatToParts(new Date(utc))
      .reduce((values, part) => {
        values[part.type] = part.value;
        return values;
      }, {});

    const rendered = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      0
    );
    utc -= rendered - target;
  }

  return new Date(utc);
}

function dateKeyInZone(date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  })
    .formatToParts(date)
    .reduce((values, part) => {
      values[part.type] = part.value;
      return values;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function spokenDateTime(date, timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone
  }).format(date);
}

function overlaps(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

function serviceLabel(serviceType) {
  if (serviceType === "yard_cleanup") return "Yard cleanup";
  if (serviceType === "tree_cutting") return "Tree services";
  if (serviceType === "mowing") return "Lawn mowing";
  return serviceType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function agentName(business) {
  return String(business?.ai_voice_name || "Ana").replace(/\s+/g, " ").trim() || "Ana";
}

function bookingTitle(serviceType) {
  return `${serviceLabel(serviceType)} booking`;
}

function ownerSummaryLanguage(language) {
  return String(language || "en").toLowerCase().startsWith("es") ? "es" : "en";
}

function businessTimeZone(business) {
  return business?.booking_time_zone || DEFAULT_TIME_ZONE;
}

function businessHoursText(business) {
  return business?.business_hours_text || BUSINESS_HOURS_TEXT;
}

function parseTimeToMinutes(value) {
  const match = String(value || "").match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3].toUpperCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour * 60 + minutes;
}

function localTimeFromMinutes(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseLocalTimeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function businessSchedule(business) {
  const text = businessHoursText(business);
  const lowerText = text.toLowerCase();
  let days = [];

  if (/\bmonday\s+(through|thru|to|-)\s+friday\b/.test(lowerText) || /\bweekdays?\b/.test(lowerText)) {
    days = BUSINESS_DAY_OPTIONS.slice(0, 5).map((day) => day.label);
  } else if (
    /\bmonday\s+(through|thru|to|-)\s+sunday\b/.test(lowerText) ||
    /\bevery\s+day\b/.test(lowerText) ||
    /\bdaily\b/.test(lowerText)
  ) {
    days = BUSINESS_DAY_OPTIONS.map((day) => day.label);
  } else if (/\bweekends?\b/.test(lowerText)) {
    days = BUSINESS_DAY_OPTIONS.slice(5).map((day) => day.label);
  } else {
    days = BUSINESS_DAY_OPTIONS.filter((day) =>
      day.aliases.some((alias) => new RegExp(`\\b${alias}\\b`, "i").test(lowerText))
    ).map((day) => day.label);
  }

  const matchedTimes = text.match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/gi) || [];
  const startMinutes = parseTimeToMinutes(matchedTimes[0]) ?? WORKDAY_START_HOUR * 60;
  const endMinutes = parseTimeToMinutes(matchedTimes[1]) ?? WORKDAY_END_HOUR * 60;

  return {
    days: days.length ? [...new Set(days)] : BUSINESS_DAY_OPTIONS.slice(0, 5).map((day) => day.label),
    endMinutes: endMinutes > startMinutes ? endMinutes : WORKDAY_END_HOUR * 60,
    startMinutes
  };
}

function businessIsOpenOn(date, timeZone, schedule) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(date);
  return schedule.days.includes(weekday);
}

function normalizeAddressForStorage(value) {
  const address = String(value || "").replace(/\s+/g, " ").trim();
  if (!address) return null;

  return address.replace(/\bAcerne(\s+(?:St|Street)\b)/gi, "Acerno$1");
}

async function sendTwilioSms({ body, to }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromPhone = process.env.TWILIO_FROM_PHONE;

  if (!accountSid || !authToken || (!messagingServiceSid && !fromPhone)) {
    return { ok: false, skipped: "sms_not_configured" };
  }

  const params = new URLSearchParams({
    Body: body,
    To: to
  });

  if (messagingServiceSid) {
    params.set("MessagingServiceSid", messagingServiceSid);
  } else {
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

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    return { ok: false, error: payload.message || `Twilio SMS failed with ${response.status}.` };
  }

  const payload = await response.json().catch(() => ({}));
  return { ok: true, sid: payload.sid || null };
}

async function sendOwnerEmail({ body, subject, to }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OFICIO_SUMMARY_FROM_EMAIL;

  if (!apiKey || !from || !to) {
    return { ok: false, skipped: "email_not_configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from,
      subject,
      text: body,
      to
    }),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    return { ok: false, error: payload.message || `Owner email failed with ${response.status}.` };
  }

  const payload = await response.json().catch(() => ({}));
  return { ok: true, id: payload.id || null };
}

async function notifyOwnerSummary({
  actionNeeded,
  businessId,
  callSessionId,
  customerId,
  ownerEmail,
  ownerPhone,
  summary,
  summaryChannel,
  summaryLanguage,
  supabase
}) {
  const language = ownerSummaryLanguage(summaryLanguage);
  const localizedSummary = await rewriteOwnerText({ kind: "summary", language, text: summary });
  const action = actionNeeded ? await rewriteOwnerText({ kind: "action item", language, text: actionNeeded }) : null;

  await supabase.from("ai_summaries").insert({
    action_needed: action,
    business_id: businessId,
    call_session_id: callSessionId || null,
    confidence: 0.9,
    customer_id: customerId || null,
    summary: localizedSummary,
    summary_language: language
  });

  const prefix = language === "es" ? "Resumen de Ana" : "Ana summary";
  const actionLine =
    action && language === "es" ? `\nAccion: ${action}` : action && language === "en" ? `\nAction: ${action}` : "";
  const body = `${prefix}: ${localizedSummary}${actionLine}`;

  if (summaryChannel === "email") {
    const email = await sendOwnerEmail({
      body,
      subject: prefix,
      to: ownerEmail
    });
    return { ok: true, email };
  }

  if (!ownerPhone) {
    return { ok: true, sms: { ok: false, skipped: "owner_phone_missing" } };
  }

  const sms = await sendTwilioSms({ body, to: ownerPhone });

  return { ok: true, sms };
}

async function getBusinessContext(businessId) {
  const supabase = supabaseAdmin();
  const { data: business, error } = await supabase
    .from("businesses")
    .select(
      "id,name,trade,phone,twilio_routing_phone,owner_transfer_phone,owner_summary_language,owner_summary_channel,available_services,booking_time_zone,business_hours_text,ai_voice_name,ai_disclosure,base_address,base_lat,base_lng"
    )
    .eq("id", businessId)
    .maybeSingle();

  if (error || !business) {
    throw new Error(error?.message || "Business not found.");
  }

  const { data: membership } = await supabase
    .from("business_users")
    .select("user_id")
    .eq("business_id", businessId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  let owner = null;
  if (membership?.user_id) {
    const { data: ownerProfile } = await supabase
      .from("users")
      .select("id,email,full_name,phone")
      .eq("id", membership.user_id)
      .maybeSingle();
    owner = ownerProfile || null;
  }

  const { data: radiusRule } = await supabase
    .from("service_radius_rules")
    .select("radius_miles,allow_outside_radius,require_owner_approval_outside_radius")
    .eq("business_id", businessId)
    .limit(1)
    .maybeSingle();

  return {
    business,
    owner,
    ownerEmail: owner?.email || null,
    ownerPhone: normalizePhone(business.owner_transfer_phone) || normalizePhone(owner?.phone),
    radiusRule: radiusRule || null,
    supabase
  };
}

function compactCallText(value, maxLength = 700) {
  const compact = String(value ?? "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3)}...`;
}

function fallbackTranscriptSummary(transcript, callerPhone, language = "en", fallbackOutcome) {
  const callerLines = String(transcript ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^Caller:/i.test(line))
    .map((line) => line.replace(/^Caller:\s*/i, ""))
    .filter(Boolean);
  const discussed = compactCallText(callerLines.join(" "), 420);
  const outcome = fallbackOutcome && fallbackOutcome !== "Realtime voice call ended." ? compactCallText(fallbackOutcome, 420) : "";

  if (language === "es") {
    if (discussed) {
      return `La persona${callerPhone ? ` ${callerPhone}` : ""} habló con Ana sobre: ${discussed}`;
    }

    if (outcome) {
      return outcome;
    }

    return `La persona${callerPhone ? ` ${callerPhone}` : ""} colgó o terminó la llamada antes de compartir detalles.`;
  }

  if (discussed) {
    return `Caller${callerPhone ? ` ${callerPhone}` : ""} spoke with Ana. Discussed: ${discussed}`;
  }

  if (outcome) {
    return outcome;
  }

  return `The caller${callerPhone ? ` ${callerPhone}` : ""} hung up or ended the call before sharing details.`;
}

function callerTranscriptText(transcript) {
  return String(transcript ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^Caller:/i.test(line))
    .map((line) => line.replace(/^Caller:\s*/i, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupExtractedPhrase(value, maxLength = 120) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();

  if (!text) return "";
  return text.length > maxLength ? text.slice(0, maxLength).replace(/\s+\S*$/, "").trim() : text;
}

function extractedCallerName(text) {
  const patterns = [
    /\b(?:my name is|name is|this is|i am|i'm|me llamo|mi nombre es|soy)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ' -]{1,60})/i,
    /\b(?:speaking with|habla con)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ' -]{1,60})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const name = cleanupExtractedPhrase(
      match?.[1]?.split(/\b(?:and|y|for|para|because|porque|calling|looking|asking|i need|i want|we need|we want|necesito|quiero)\b/i)[0],
      70
    );
    if (!name) continue;
    if (/^(calling|looking|interested|trying|asking|from|about|regarding|available|needing|need|want|service|a|an|the|de|para|por)\b/i.test(name)) {
      continue;
    }
    return name;
  }

  return null;
}

function extractedEmail(text) {
  return text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] ?? null;
}

function extractedServiceType(text, serviceOptions = SERVICE_OPTIONS) {
  const lowerText = String(text || "").toLowerCase();
  const aliases = [
    { aliases: ["yard cleanup", "yard clean up", "clean up my yard", "limpieza de patio", "patio"], value: "yard_cleanup" },
    { aliases: ["tree cutting", "tree service", "tree services", "tree trimming", "arbol", "árbol"], value: "tree_cutting" },
    { aliases: ["lawn mowing", "mowing", "mow", "grass cutting", "cut grass", "corte de césped", "cesped", "césped"], value: "mowing" },
    { aliases: ["irrigation", "sprinkler", "sprinklers", "riego"], value: "irrigation" },
    { aliases: ["landscaping", "landscape", "paisajismo", "jardineria", "jardinería"], value: "landscaping" }
  ];

  for (const option of aliases) {
    if (serviceOptions.includes(option.value) && option.aliases.some((alias) => lowerText.includes(alias))) {
      return option.value;
    }
  }

  return null;
}

function extractedAddress(text) {
  const patterns = [
    /\b(?:service address|job address|address|direccion|dirección)\s+(?:is|it's|its|es|at|en)\s+([^.\n]{5,180})/i,
    /\b(?:located at|i am at|i'm at|we are at|we're at|estoy en|estamos en)\s+([^.\n]{5,180})/i,
    /\b(\d{1,6}\s+[A-Za-z0-9 .'-]{2,90}\s(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|boulevard|blvd|way|place|pl)\b[^.\n]{0,90})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const rawAddress = match?.[1]
      ?.split(/\b(?:and my|and i|my phone|phone number|email|correo|the service|i need|i want|quiero|necesito)\b/i)[0]
      ?.split(/\b(?:for a|for the|para un|para el)\b/i)[0];
    const address = normalizeAddressForStorage(cleanupExtractedPhrase(rawAddress, 180));
    if (address && /\d/.test(address)) return address;
  }

  return null;
}

function extractedReferralSource(text) {
  const normalized = normalizeCustomerSource(text);
  return normalized === "other" ? null : normalized;
}

function shouldSkipFallbackLead(call) {
  if (call.customer_id || call.job_id) return true;
  if (["personal", "spam", "vendor"].includes(call.contact_type)) return true;
  if (call.status === "transferred") return true;
  return false;
}

async function ensureFallbackLeadFromTranscript({ businessId, callSessionId, fallbackOutcome, transcript }) {
  if (!businessId || !callSessionId || !transcript) return null;

  const { business, supabase } = await getBusinessContext(businessId);
  const { data: call, error } = await supabase
    .from("call_sessions")
    .select("id,business_id,customer_id,job_id,contact_type,from_phone,status,detected_language")
    .eq("id", callSessionId)
    .maybeSingle();

  if (error || !call || shouldSkipFallbackLead(call)) {
    if (error) console.error("Could not load call before fallback lead creation:", error.message);
    return null;
  }

  const callerText = callerTranscriptText(transcript);
  if (callerText.length < 18) return null;

  const serviceOptions = businessServiceOptions(business);
  const serviceType = extractedServiceType(callerText, serviceOptions);
  const customerName = extractedCallerName(callerText);
  const address = extractedAddress(callerText);
  const email = extractedEmail(callerText);
  const referralSource = extractedReferralSource(callerText);
  const hasLeadSignal = Boolean(serviceType || customerName || address || email);

  if (!hasLeadSignal) return null;

  const customer = await findOrCreateCustomer({
    address,
    businessId,
    email,
    name: customerName,
    phone: call.from_phone,
    referralSource,
    supabase
  });
  const language = ownerSummaryLanguage(business.owner_summary_language);
  const service = serviceType ? serviceLabel(serviceType) : "service";
  const summary =
    language === "es"
      ? `${customer.full_name} compartió detalles por teléfono sobre ${service}. ${fallbackTranscriptSummary(transcript, normalizePhone(call.from_phone), language, fallbackOutcome)}`
      : `${customer.full_name} shared phone details about ${service}. ${fallbackTranscriptSummary(transcript, normalizePhone(call.from_phone), language, fallbackOutcome)}`;

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      address: address || customer.address || null,
      ai_notes: compactCallText(callerText, 700),
      business_id: businessId,
      customer_id: customer.id,
      estimated_value: 0,
      service_type: serviceType,
      status: "lead",
      title: serviceType ? `${serviceLabel(serviceType)} lead` : "Voice call lead"
    })
    .select("id")
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);

  await upsertCallerContact({
    businessId,
    customerId: customer.id,
    displayName: customer.full_name,
    phone: call.from_phone,
    supabase
  });

  const { error: updateError } = await supabase
    .from("call_sessions")
    .update({
      contact_type: "customer",
      customer_id: customer.id,
      job_id: job?.id || null,
      needs_owner_review: true,
      outcome: summary,
      status: "completed"
    })
    .eq("id", callSessionId);

  if (updateError) throw new Error(updateError.message);
  return { customerId: customer.id, jobId: job?.id || null, summary };
}

async function rewriteOwnerText({ kind = "summary", language, text }) {
  const compactText = compactCallText(text, 700);
  void kind;
  void language;
  return compactText;
}

async function summarizeTranscript({ callerPhone, fallbackOutcome, language, transcript }) {
  const normalizedLanguage = ownerSummaryLanguage(language);
  const safeTranscript = String(transcript ?? "").trim();
  return fallbackTranscriptSummary(safeTranscript, callerPhone, normalizedLanguage, fallbackOutcome);
}

async function ensureCallArtifacts({ businessId, callSessionId, fallbackOutcome, transcript }) {
  if (!businessId || !callSessionId) return;

  const { business, supabase } = await getBusinessContext(businessId);
  const { data: call, error: callError } = await supabase
    .from("call_sessions")
    .select("id,business_id,customer_id,from_phone,to_phone,detected_language,outcome")
    .eq("id", callSessionId)
    .maybeSingle();

  if (callError || !call) {
    if (callError) console.error("Could not load call session for artifacts:", callError.message);
    return;
  }

  const language = ownerSummaryLanguage(business.owner_summary_language);
  const summary = await summarizeTranscript({
    callerPhone: normalizePhone(call.from_phone),
    fallbackOutcome: fallbackOutcome || call.outcome,
    language,
    transcript
  });
  const providerMessageId = `voice:${callSessionId}`;

  const { data: existingSummary } = await supabase
    .from("ai_summaries")
    .select("id")
    .eq("call_session_id", callSessionId)
    .limit(1)
    .maybeSingle();

  if (existingSummary) {
    const { error: summaryUpdateError } = await supabase
      .from("ai_summaries")
      .update({
        confidence: transcript ? 0.9 : 0.65,
        summary,
        summary_language: language
      })
      .eq("id", existingSummary.id);

    if (summaryUpdateError) console.error("Could not update call AI summary:", summaryUpdateError.message);
  } else {
    const { error: summaryError } = await supabase.from("ai_summaries").insert({
      action_needed: null,
      business_id: businessId,
      call_session_id: callSessionId,
      confidence: transcript ? 0.9 : 0.65,
      customer_id: call.customer_id || null,
      summary,
      summary_language: language
    });

    if (summaryError) console.error("Could not create call AI summary:", summaryError.message);
  }

  const { data: existingMessage } = await supabase
    .from("messages")
    .select("id")
    .eq("business_id", businessId)
    .eq("provider_message_id", providerMessageId)
    .limit(1)
    .maybeSingle();

  if (existingMessage) {
    const { error: messageUpdateError } = await supabase
      .from("messages")
      .update({
        body: summary,
        language
      })
      .eq("id", existingMessage.id);

    if (messageUpdateError) console.error("Could not update voice message log:", messageUpdateError.message);
  } else {
    const { error: messageError } = await supabase.from("messages").insert({
      body: summary,
      business_id: businessId,
      channel: "voice",
      customer_id: call.customer_id || null,
      direction: "inbound",
      from_phone: normalizePhone(call.from_phone),
      language: call.detected_language || language,
      provider_message_id: providerMessageId,
      to_phone: normalizePhone(call.to_phone)
    });

    if (messageError) console.error("Could not create voice message log:", messageError.message);
  }
}

async function geocodeAddress(address) {
  const query = normalizeAddressForStorage(address);
  if (!query) return { error: "No address was provided.", ok: false };
  const apiKey = geocodioApiKey();
  if (!apiKey) return { error: "GEOCODIO_API_KEY is not configured.", ok: false, skipped: "missing_api_key" };

  const url = new URL(GEOCODIO_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("country", "USA");
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url);
  if (!response.ok) return { error: `Geocodio returned ${response.status}.`, ok: false };

  const payload = await response.json();
  const first = payload?.results?.[0];
  const lat = numericCoordinate(first?.location?.lat);
  const lng = numericCoordinate(first?.location?.lng);
  const accuracy = numericCoordinate(first?.accuracy);

  if (!first || lat === null || lng === null) {
    return { error: "Could not find coordinates for that address.", ok: false };
  }

  if (accuracy !== null && accuracy < 0.6) {
    return { error: "The address match is too uncertain. Ask for a more complete service address.", ok: false };
  }

  return {
    address: {
      accuracy,
      formattedAddress: first.formatted_address || query,
      lat,
      lng,
      provider: "geocodio"
    },
    ok: true
  };
}

async function existingBookings(supabase, businessId, start, end) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id,title,scheduled_start,scheduled_end,status")
    .eq("business_id", businessId)
    .not("scheduled_start", "is", null)
    .gte("scheduled_start", start.toISOString())
    .lt("scheduled_start", end.toISOString())
    .neq("status", "canceled");

  if (error) throw new Error(error.message);
  return data || [];
}

async function availabilityExceptions(supabase, businessId, startDate, endDate) {
  const { data, error } = await supabase
    .from("business_availability_exceptions")
    .select("id,title,starts_on,ends_on,message")
    .eq("business_id", businessId)
    .lte("starts_on", endDate)
    .gte("ends_on", startDate)
    .order("starts_on", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

function closureForDate(closures, dateKey) {
  return closures.find((closure) => closure.starts_on <= dateKey && closure.ends_on >= dateKey) || null;
}

async function availableSlots({ businessId, date, durationMinutes = DEFAULT_SLOT_MINUTES, days = 7 }) {
  const { business, supabase } = await getBusinessContext(businessId);
  const timeZone = businessTimeZone(business);
  const schedule = businessSchedule(business);
  const now = new Date();
  const dateKeys = [];

  if (date) {
    dateKeys.push(date);
  } else {
    for (let offset = 0; dateKeys.length < days && offset < 21; offset += 1) {
      const candidateDateKey = dateKeyInZone(addMinutes(now, offset * 24 * 60), timeZone);
      const candidateNoon = localDateTimeToUtc(candidateDateKey, "12:00", timeZone);
      if (businessIsOpenOn(candidateNoon, timeZone, schedule)) dateKeys.push(candidateDateKey);
    }
  }

  if (!dateKeys.length) {
    return { closedDates: [], slots: [], timeZone };
  }

  const rangeStart = localDateTimeToUtc(dateKeys[0], "00:00", timeZone);
  const rangeEnd = addMinutes(localDateTimeToUtc(dateKeys.at(-1), "23:59", timeZone), 1);
  const closures = await availabilityExceptions(supabase, businessId, dateKeys[0], dateKeys.at(-1));
  const closedDates = dateKeys
    .map((dateKey) => {
      const closure = closureForDate(closures, dateKey);
      return closure
        ? {
            date: dateKey,
            message: closure.message || "Sorry, we don't have any appointments for that whole day.",
            title: closure.title || "Closed"
          }
        : null;
    })
    .filter(Boolean);
  const bookings = await existingBookings(supabase, businessId, rangeStart, rangeEnd);
  const slots = [];

  for (const dateKey of dateKeys) {
    if (closureForDate(closures, dateKey)) continue;

    const dayStart = localDateTimeToUtc(dateKey, "12:00", timeZone);
    if (!businessIsOpenOn(dayStart, timeZone, schedule)) continue;

    for (let minutesOfDay = schedule.startMinutes; minutesOfDay < schedule.endMinutes; minutesOfDay += SLOT_STEP_MINUTES) {
      const start = localDateTimeToUtc(dateKey, localTimeFromMinutes(minutesOfDay), timeZone);
      const end = addMinutes(start, durationMinutes);
      const closes = localDateTimeToUtc(dateKey, localTimeFromMinutes(schedule.endMinutes), timeZone);

      if (start <= addMinutes(now, 120) || end > closes) continue;

      const conflict = bookings.some((booking) => {
        const bookingStart = new Date(booking.scheduled_start);
        const bookingEnd = booking.scheduled_end ? new Date(booking.scheduled_end) : addMinutes(bookingStart, durationMinutes);
        return overlaps(start, end, bookingStart, bookingEnd);
      });

      if (!conflict) {
        slots.push({
          date: dateKey,
          end: end.toISOString(),
          label: spokenDateTime(start, timeZone),
          start: start.toISOString(),
          time_zone: timeZone,
          time: localTimeFromMinutes(minutesOfDay)
        });
      }
    }
  }

  return { closedDates, slots: slots.slice(0, 8), timeZone };
}

async function findOrCreateCustomer({ address, businessId, email, geocodedAddress, name, phone, referralSource, supabase }) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedAddress = normalizeAddressForStorage(address);
  const source = normalizeCustomerSource(referralSource);
  const fullName = String(name || "").trim();

  if (normalizedPhone) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id,full_name,address,email,lat,lng,referral_source,recurring_service_type,service_fee")
      .eq("business_id", businessId)
      .eq("phone", normalizedPhone)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const updates = {};
      if (normalizedAddress && normalizedAddress !== existing.address) updates.address = normalizedAddress;
      if (geocodedAddress) {
        updates.geocode_accuracy = geocodedAddress.accuracy;
        updates.geocode_provider = geocodedAddress.provider;
        updates.geocoded_at = new Date().toISOString();
        updates.lat = geocodedAddress.lat;
        updates.lng = geocodedAddress.lng;
      }
      if (email && !existing.email) updates.email = email;
      if (source !== "other" && (!existing.referral_source || existing.referral_source === "other")) {
        updates.referral_source = source;
      }
      if (fullName && /^(phone caller|caller\s+\+?\d+)/i.test(String(existing.full_name || ""))) {
        updates.full_name = fullName;
      }

      if (Object.keys(updates).length) {
        const { data: updated, error: updateError } = await supabase
          .from("customers")
          .update(updates)
          .eq("id", existing.id)
          .select("id,full_name,address,lat,lng,recurring_service_type,service_fee")
          .single();

        if (updateError) throw new Error(updateError.message);
        return updated;
      }

      return existing;
    }
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      address: normalizedAddress,
      business_id: businessId,
      email: email || null,
      full_name: fullName || (normalizedPhone ? `Caller ${normalizedPhone}` : "Phone caller"),
      geocode_accuracy: geocodedAddress?.accuracy ?? null,
      geocode_provider: geocodedAddress?.provider ?? null,
      geocoded_at: geocodedAddress ? new Date().toISOString() : null,
      lat: geocodedAddress?.lat ?? null,
      lng: geocodedAddress?.lng ?? null,
      notes: "Created by Ana during a realtime voice call.",
      phone: normalizedPhone,
      preferred_language: "auto",
      referral_source: source
    })
    .select("id,full_name,address,lat,lng,recurring_service_type,service_fee")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

function appointmentEstimatedValue(args, customer) {
  const requestedValue = Number(args.estimated_value);
  if (Number.isFinite(requestedValue)) return requestedValue;

  const customerFee = Number(customer?.service_fee);
  if (Number.isFinite(customerFee) && (!customer.recurring_service_type || customer.recurring_service_type === args.service_type)) {
    return customerFee;
  }

  return 0;
}

async function evaluateServiceArea({ address, business, radiusRule }) {
  const baseLat = numericCoordinate(business?.base_lat);
  const baseLng = numericCoordinate(business?.base_lng);
  const radiusMiles = Number(radiusRule?.radius_miles);

  if (!address || baseLat === null || baseLng === null || !Number.isFinite(radiusMiles) || radiusMiles <= 0) {
    return { checked: false, ok: true, reason: "service_area_not_configured" };
  }

  const geocoded = await geocodeAddress(address);
  if (!geocoded.ok) {
    if (geocoded.skipped === "missing_api_key") {
      return { checked: false, ok: true, reason: "geocoding_not_configured" };
    }

    return { checked: true, error: geocoded.error, ok: false, reason: "geocoding_failed" };
  }

  const distance = distanceMiles({ lat: baseLat, lng: baseLng }, { lat: geocoded.address.lat, lng: geocoded.address.lng });
  const outsideRadius = distance > radiusMiles;
  const allowOutsideRadius = Boolean(radiusRule?.allow_outside_radius);

  return {
    allowOutsideRadius,
    checked: true,
    distanceMiles: distance,
    geocodedAddress: geocoded.address,
    ok: !outsideRadius || allowOutsideRadius,
    outsideRadius,
    radiusMiles,
    reason: outsideRadius ? "outside_radius" : "inside_radius"
  };
}

function customerBookingConfirmationText({ address, agent, businessName, customerName, serviceType, start, timeZone }) {
  const greetingName = String(customerName || "").trim().split(/\s+/)[0];
  const greeting = greetingName ? `Hi ${greetingName}` : "Hi";
  const location = address ? ` at ${address}` : "";
  return `${greeting}, this is ${agent} with ${businessName}. Your ${serviceLabel(serviceType)} appointment is confirmed for ${spokenDateTime(start, timeZone)}${location}. Reply here if you need to update it.`;
}

function ownerBookingApprovalText({ address, agent, businessName, customerName, customerPhone, estimatedValue, serviceType, start, timeZone }) {
  const location = address ? `\nAddress: ${address}` : "";
  const value = Number.isFinite(Number(estimatedValue)) ? Number(estimatedValue) : 0;
  return [
    `${agent} booking request for ${businessName}:`,
    `${customerName || "Customer"}${customerPhone ? ` (${customerPhone})` : ""}`,
    `${serviceLabel(serviceType)} - ${spokenDateTime(start, timeZone)}`,
    `Value: $${Math.round(value)}`,
    `${location}`,
    "Reply YES to confirm and text the customer. Reply NO to keep it as a lead."
  ]
    .filter(Boolean)
    .join("\n");
}

async function createOwnerBookingConfirmation({
  address,
  business,
  callSessionId,
  customer,
  estimatedValue,
  jobId,
  ownerPhone,
  serviceType,
  start,
  supabase,
  timeZone,
  toPhone
}) {
  if (!ownerPhone) return { ok: false, skipped: "owner_phone_missing" };

  const customerPhone = normalizePhone(toPhone);
  const agent = agentName(business);
  const customerConfirmationBody = customerBookingConfirmationText({
    address,
    agent,
    businessName: business.name,
    customerName: customer.full_name,
    serviceType,
    start,
    timeZone
  });
  const promptBody = ownerBookingApprovalText({
    address,
    agent,
    businessName: business.name,
    customerName: customer.full_name,
    customerPhone,
    estimatedValue,
    serviceType,
    start,
    timeZone
  });

  const sms = await sendTwilioSms({ body: promptBody, to: ownerPhone });

  const { data: confirmation, error } = await supabase
    .from("owner_booking_confirmations")
    .insert({
      business_id: business.id,
      call_session_id: callSessionId || null,
      customer_confirmation_body: customerConfirmationBody,
      customer_id: customer.id,
      customer_phone: customerPhone,
      due_at: new Date().toISOString(),
      job_id: jobId,
      owner_phone: ownerPhone,
      prompt_body: promptBody,
      provider_message_id: sms.sid || null,
      sent_at: sms.ok ? new Date().toISOString() : null,
      status: sms.ok ? "sent" : "failed",
      error_message: sms.ok ? null : sms.error || sms.skipped || null
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message, sms };
  return { ok: Boolean(sms.ok), confirmation_id: confirmation?.id || null, sms };
}

async function upsertCallerContact({ businessId, customerId, displayName, phone, supabase }) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return;

  const { error } = await supabase.from("caller_contacts").upsert(
    {
      business_id: businessId,
      classification: "customer",
      customer_id: customerId,
      display_name: displayName || null,
      phone: normalizedPhone
    },
    { onConflict: "business_id,phone" }
  );

  if (error) throw new Error(error.message);
}

async function bookAppointment({ args, callSessionId, businessId, callerPhone }) {
  const { business, ownerEmail, ownerPhone, radiusRule, supabase } = await getBusinessContext(businessId);
  const serviceOptions = businessServiceOptions(business);

  if (!serviceOptions.includes(args.service_type)) {
    return { ok: false, message: "That service is not in this business's service list.", service_options: serviceOptions };
  }

  if (!args.scheduled_date || !args.scheduled_time) {
    return { ok: false, message: "Ask for a specific date and time before booking." };
  }

  const timeZone = businessTimeZone(business);
  const schedule = businessSchedule(business);
  const durationMinutes = Number.isFinite(Number(args.duration_minutes)) ? Number(args.duration_minutes) : DEFAULT_SLOT_MINUTES;
  const start = localDateTimeToUtc(args.scheduled_date, args.scheduled_time, timeZone);
  const end = addMinutes(start, durationMinutes);
  if (start <= addMinutes(new Date(), 120)) {
    return { ok: false, message: "That time is too soon to book. Offer a later time." };
  }

  const scheduledMinutes = parseLocalTimeToMinutes(args.scheduled_time);
  if (scheduledMinutes === null) {
    return { ok: false, message: "Ask for the appointment time again before booking." };
  }

  if (
    !businessIsOpenOn(localDateTimeToUtc(args.scheduled_date, "12:00", timeZone), timeZone, schedule) ||
    scheduledMinutes < schedule.startMinutes ||
    scheduledMinutes + durationMinutes > schedule.endMinutes
  ) {
    return { ok: false, message: `That time is outside the business hours: ${businessHoursText(business)}.` };
  }

  const dayStart = localDateTimeToUtc(args.scheduled_date, "00:00", timeZone);
  const dayEnd = addMinutes(localDateTimeToUtc(args.scheduled_date, "23:59", timeZone), 1);
  const closures = await availabilityExceptions(supabase, businessId, args.scheduled_date, args.scheduled_date);
  const closure = closureForDate(closures, args.scheduled_date);
  if (closure) {
    return {
      closed_date: args.scheduled_date,
      closed_reason: closure.title || "Closed",
      ok: false,
      message: closure.message || "Sorry, we don't have any appointments for that whole day. Offer another day."
    };
  }

  const bookings = await existingBookings(supabase, businessId, dayStart, dayEnd);
  const conflict = bookings.some((booking) => {
    const bookingStart = new Date(booking.scheduled_start);
    const bookingEnd = booking.scheduled_end ? new Date(booking.scheduled_end) : addMinutes(bookingStart, durationMinutes);
    return overlaps(start, end, bookingStart, bookingEnd);
  });

  if (conflict) {
    const alternatives = await availableSlots({ businessId, date: args.scheduled_date, durationMinutes: DEFAULT_SLOT_MINUTES });
    return {
      alternatives: alternatives.slots,
      ok: false,
      message: "That time is already booked. Offer one of the available alternatives."
    };
  }

  const address = normalizeAddressForStorage(args.address);
  const serviceArea = await evaluateServiceArea({ address, business, radiusRule });
  if (!serviceArea.ok) {
    return {
      distance_miles: serviceArea.distanceMiles ? Number(serviceArea.distanceMiles.toFixed(1)) : null,
      message:
        serviceArea.reason === "outside_radius"
          ? `This address is outside the business service area. Tell the caller the business is not currently serving that area.`
          : serviceArea.error || "Ask for the service address again.",
      ok: false,
      radius_miles: serviceArea.radiusMiles ?? null,
      service_area: serviceArea.reason
    };
  }

  const customer = await findOrCreateCustomer({
    address: args.address,
    businessId,
    email: args.customer_email,
    geocodedAddress: serviceArea.geocodedAddress,
    name: args.customer_name,
    phone: args.customer_phone || callerPhone,
    referralSource: args.how_heard_about_us,
    supabase
  });

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      address: address || customer.address || null,
      ai_notes: args.notes || "Booked by Ana from a realtime phone call.",
      business_id: businessId,
      customer_id: customer.id,
      estimated_value: appointmentEstimatedValue(args, customer),
      geocode_accuracy: serviceArea.geocodedAddress?.accuracy ?? null,
      geocode_provider: serviceArea.geocodedAddress?.provider ?? null,
      geocoded_at: serviceArea.geocodedAddress ? new Date().toISOString() : null,
      lat: serviceArea.geocodedAddress?.lat ?? null,
      lng: serviceArea.geocodedAddress?.lng ?? null,
      scheduled_end: end.toISOString(),
      scheduled_start: start.toISOString(),
      service_type: args.service_type,
      status: "pending",
      title: bookingTitle(args.service_type)
    })
    .select("id")
    .single();

  if (jobError) throw new Error(jobError.message);

  await upsertCallerContact({
    businessId,
    customerId: customer.id,
    displayName: customer.full_name,
    phone: args.customer_phone || callerPhone,
    supabase
  });

  const ownerApproval = await createOwnerBookingConfirmation({
    address: address || customer.address || null,
    business,
    callSessionId,
    customer,
    estimatedValue: appointmentEstimatedValue(args, customer),
    jobId: job.id,
    ownerPhone,
    serviceType: args.service_type,
    start,
    supabase,
    timeZone,
    toPhone: args.customer_phone || callerPhone || customer.phone
  }).catch((error) => {
    console.error("Could not send owner booking approval:", error.message);
    return { ok: false, error: error.message };
  });

  if (!ownerApproval.ok) {
    await supabase.from("jobs").update({ status: "lead" }).eq("id", job.id);
  }

  if (callSessionId) {
    await supabase
      .from("call_sessions")
      .update({
        contact_type: "customer",
        customer_id: customer.id,
        job_id: job.id,
        needs_owner_review: ownerApproval.ok,
        outcome: ownerApproval.ok
          ? `Pending owner approval for ${serviceLabel(args.service_type)} on ${spokenDateTime(start, timeZone)}.`
          : `Saved lead for ${serviceLabel(args.service_type)} on ${spokenDateTime(start, timeZone)} because owner approval SMS was not sent.`,
        status: "completed"
      })
      .eq("id", callSessionId);

    const language = ownerSummaryLanguage(business.owner_summary_language);
    const summary =
      language === "es"
        ? `${customer.full_name} solicito ${serviceLabel(args.service_type)} para ${spokenDateTime(start, timeZone)}. Esperando aprobacion del dueño.`
        : `${customer.full_name} requested ${serviceLabel(args.service_type)} for ${spokenDateTime(start, timeZone)}. Waiting for owner approval.`;

    await notifyOwnerSummary({
      businessId,
      callSessionId,
      customerId: customer.id,
      ownerEmail,
      ownerPhone,
      summary,
      summaryChannel: business.owner_summary_channel,
      summaryLanguage: language,
      supabase
    });
  }

  return {
    booking_id: job.id,
    customer_name: customer.full_name,
    message: ownerApproval.ok
      ? "Tell the caller the appointment request has been sent to the owner and they will receive a confirmation text after approval. Then ask if there is anything else you can help with."
      : "Tell the caller the appointment request was saved and the owner will follow up. Then ask if there is anything else you can help with.",
    owner_approval: ownerApproval,
    ok: true,
    scheduled_for: spokenDateTime(start, timeZone)
  };
}

async function recordCallSummary({ args, businessId, callerPhone, callSessionId }) {
  const { business, ownerEmail, ownerPhone, supabase } = await getBusinessContext(businessId);
  const address = normalizeAddressForStorage(args.address);
  const customer = await findOrCreateCustomer({
    address: args.address,
    businessId,
    email: args.customer_email,
    name: args.customer_name,
    phone: args.customer_phone || callerPhone,
    referralSource: args.how_heard_about_us,
    supabase
  });
  const language = ownerSummaryLanguage(business.owner_summary_language);
  const service = isServiceOption(args.service_type) ? serviceLabel(args.service_type) : args.service_type || "service";
  const rawSummary =
    language === "es"
      ? `${customer.full_name} llamo sobre ${service}. ${args.summary}`
      : `${customer.full_name} called about ${service}. ${args.summary}`;
  const summary = await rewriteOwnerText({ kind: "summary", language, text: rawSummary });
  const actionNeeded =
    args.action_needed ||
    (language === "es" ? "Revisar y hacer seguimiento con el cliente." : "Review and follow up with the customer.");

  const { data: job } = await supabase
    .from("jobs")
    .insert({
      address: address || customer.address || null,
      ai_notes: args.summary || null,
      business_id: businessId,
      customer_id: customer.id,
      estimated_value: 0,
      service_type: isServiceOption(args.service_type) ? args.service_type : null,
      status: "lead",
      title: `${service} lead`
    })
    .select("id")
    .maybeSingle();

  await upsertCallerContact({
    businessId,
    customerId: customer.id,
    displayName: customer.full_name,
    phone: args.customer_phone || callerPhone,
    supabase
  });

  if (callSessionId) {
    await supabase
      .from("call_sessions")
      .update({
        contact_type: "customer",
        customer_id: customer.id,
        job_id: job?.id || null,
        needs_owner_review: true,
        outcome: summary,
        status: "completed"
      })
      .eq("id", callSessionId);
  }

  const notification = await notifyOwnerSummary({
    actionNeeded,
    businessId,
    callSessionId,
    customerId: customer.id,
    ownerEmail,
    ownerPhone,
    summary,
    summaryChannel: business.owner_summary_channel,
    summaryLanguage: language,
    supabase
  });

  return {
    customer_name: customer.full_name,
    message: "Tell the caller you have the details and someone will follow up. Then ask if there is anything else you can help with.",
    notification,
    ok: true,
    summary
  };
}

async function updateCallOutcome({ businessId, callSessionId, outcome, status = "completed", transcript }) {
  if (!callSessionId) return;
  const { supabase } = await getBusinessContext(businessId);
  await supabase
    .from("call_sessions")
    .update({
      ended_at: new Date().toISOString(),
      outcome,
      status,
      transcript: transcript || null
    })
    .eq("id", callSessionId);
}

async function finishRealtimeCall({
  allowFallbackLead = true,
  businessId,
  callSessionId,
  outcome = "Realtime voice call ended.",
  status = "completed",
  transcript
}) {
  if (!businessId || !callSessionId) return;
  const { supabase } = await getBusinessContext(businessId);
  const { data: existing, error } = await supabase
    .from("call_sessions")
    .select("id,status,outcome,transcript")
    .eq("id", callSessionId)
    .maybeSingle();

  if (error || !existing) {
    if (error) console.error("Could not load call before finishing:", error.message);
    return;
  }

  const values = {
    ended_at: new Date().toISOString(),
    transcript: transcript || existing.transcript || null
  };

  if (!existing.outcome) values.outcome = outcome;
  if (existing.status === "active") values.status = status;

  const { error: updateError } = await supabase.from("call_sessions").update(values).eq("id", callSessionId);
  if (updateError) {
    console.error("Could not finish call session:", updateError.message);
    return;
  }

  const fallbackLead = allowFallbackLead
    ? await ensureFallbackLeadFromTranscript({
        businessId,
        callSessionId,
        fallbackOutcome: existing.outcome || outcome,
        transcript: values.transcript
      }).catch((fallbackError) => {
        console.error("Could not create fallback lead from transcript:", fallbackError.message);
        return null;
      })
    : null;

  await ensureCallArtifacts({
    businessId,
    callSessionId,
    fallbackOutcome: fallbackLead?.summary || existing.outcome || outcome,
    transcript: values.transcript
  });
}

async function transferToOwner({ businessId, callSid, callSessionId, reason }) {
  if (!callSid) {
    return { ok: false, message: "Cannot transfer because Twilio did not provide a live call id." };
  }

  const accountSid = requiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = requiredEnv("TWILIO_AUTH_TOKEN");
  const { business, ownerPhone, supabase } = await getBusinessContext(businessId);

  if (!ownerPhone) {
    return { ok: false, message: "No owner transfer phone is configured." };
  }

  const callerId = business.twilio_routing_phone || business.phone || undefined;
  const callerIdAttribute = callerId ? ` callerId="${xmlEscape(callerId)}"` : "";
  const twiml = `<Response><Dial${callerIdAttribute}>${xmlEscape(ownerPhone)}</Dial></Response>`;
  const body = new URLSearchParams({ Twiml: twiml });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`, {
    body,
    headers: {
      authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Twilio transfer failed with ${response.status}.`);
  }

  if (callSessionId) {
    await supabase
      .from("call_sessions")
      .update({
        outcome: reason || "Caller transferred to owner by Ana.",
        status: "transferred",
        transferred_to_owner_at: new Date().toISOString()
      })
      .eq("id", callSessionId);
  }

  return { ok: true, message: "The caller is being transferred to the owner now." };
}

async function redirectLiveCallToTwiml({ callSid, twiml }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken || !callSid) return { ok: false };

  const body = new URLSearchParams({ Twiml: twiml });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`, {
    body,
    headers: {
      authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    console.error("Could not redirect live Twilio call:", payload.message || response.status);
    return { ok: false };
  }

  return { ok: true };
}

async function failLiveCall({ message, state, twilioWs }) {
  const twiml = `<Response><Say voice="Polly.Joanna" language="en-US">${xmlEscape(message)}</Say><Hangup /></Response>`;

  if (state.businessId && state.callSessionId) {
    await updateCallOutcome({
      businessId: state.businessId,
      callSessionId: state.callSessionId,
      outcome: message,
      status: "failed",
      transcript: state.transcriptParts.join("\n")
    }).catch((error) => console.error("Could not mark call as failed:", error));
  }

  await redirectLiveCallToTwiml({ callSid: state.callSid, twiml });
  if (twilioWs.readyState === WebSocket.OPEN) {
    twilioWs.close(1011, "realtime failed");
  }
}

function scheduleLiveHangup({ delayMs = 1600, state, twilioWs }) {
  if (state.hangupTimer) return;

  state.hangupTimer = setTimeout(async () => {
    state.hangupTimer = null;
    const redirected = await redirectLiveCallToTwiml({
      callSid: state.callSid,
      twiml: "<Response><Hangup /></Response>"
    }).catch((error) => {
      console.error("Could not hang up live Twilio call:", error.message);
      return { ok: false };
    });

    if (!redirected.ok && twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.close(1000, "call ended");
    }
  }, delayMs);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function realtimeTools(serviceOptions = SERVICE_OPTIONS) {
  return [
    {
      type: "function",
      name: "list_available_slots",
      description: "Check the owner's booking calendar and return open appointment times.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Optional local date in YYYY-MM-DD format. Omit to search the next week."
          },
          service_type: {
            type: "string",
            enum: serviceOptions
          }
        }
      }
    },
    {
      type: "function",
      name: "book_appointment",
      description: "Create an owner approval request after the caller agrees to an available date and time.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string" },
          customer_email: { type: "string" },
          customer_name: { type: "string" },
          customer_phone: { type: "string" },
          duration_minutes: { type: "number" },
          estimated_value: { type: "number", description: "Use the known customer service fee when available. Use 0 for quote appointments or unknown pricing." },
          how_heard_about_us: {
            type: "string",
            description: "For a new customer, normalize how they heard about the business.",
            enum: CUSTOMER_SOURCE_OPTIONS
          },
          notes: { type: "string" },
          scheduled_date: { type: "string", description: "Local date in YYYY-MM-DD format." },
          scheduled_time: { type: "string", description: "Local 24-hour time in HH:mm format." },
          service_type: { type: "string", enum: serviceOptions }
        },
        required: ["address", "customer_name", "scheduled_date", "scheduled_time", "service_type"]
      }
    },
    {
      type: "function",
      name: "transfer_to_owner",
      description: "Transfer the live call to the owner when the caller is personal, a vendor, upset, or asks for a human.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" }
        }
      }
    },
    {
      type: "function",
      name: "record_call_summary",
      description:
        "Record a business call summary and notify the owner when the caller shared useful business details but did not book a confirmed appointment.",
      parameters: {
        type: "object",
        properties: {
          action_needed: { type: "string" },
          address: { type: "string" },
          customer_email: { type: "string" },
          customer_name: { type: "string" },
          customer_phone: { type: "string" },
          how_heard_about_us: {
            type: "string",
            description: "For a new customer, normalize how they heard about the business.",
            enum: CUSTOMER_SOURCE_OPTIONS
          },
          service_type: { type: "string" },
          summary: { type: "string" }
        },
        required: ["customer_name", "summary"]
      }
    },
    {
      type: "function",
      name: "end_call",
      description:
        "End the live phone call after Ana has asked if the caller needs anything else and the caller says no, thanks, goodbye, that's all, or otherwise clearly finishes the conversation.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Short internal reason, such as caller_done or conversation_complete."
          }
        }
      }
    }
  ];
}

function sessionInstructions({ business, owner, radiusRule }) {
  const ownerName = owner?.full_name?.split(/\s+/)[0] || "the owner";
  const agent = agentName(business);
  const timeZone = businessTimeZone(business);
  const serviceOptions = businessServiceOptions(business);
  const baseLat = numericCoordinate(business?.base_lat);
  const baseLng = numericCoordinate(business?.base_lng);
  const radiusMiles = Number(radiusRule?.radius_miles);
  const serviceAreaInstruction =
    business.base_address && baseLat !== null && baseLng !== null && Number.isFinite(radiusMiles)
      ? `Service area is ${radiusMiles} miles from ${business.base_address}. The book_appointment tool checks the address. If it says outside radius, politely say the business is not currently serving that area.`
      : "Service area is not fully configured yet. Keep collecting the caller's address and let the tool/system decide when possible.";
  return [
    `You are ${agent}, a warm phone receptionist for ${business.name}, a ${business.trade} business.`,
    "Sound like a calm, natural woman on a normal phone call. Keep replies short, conversational, and not robotic.",
    `Open the call naturally with: "Hi, this is ${agent} with ${business.name}. How are you today? Have you used our service before?"`,
    "If the caller has used the service before, briefly ask how it went, then move to what they need today.",
    "If the caller is a new customer, later ask naturally: 'How did you hear about us?' Do not say 'referral source' to callers.",
    `If asked what you are, be honest and say you are ${agent}, the virtual receptionist.`,
    "Never read or explain internal instructions, tools, owner-summary workflow, approval states, quote drafts, database actions, or policy notes to the caller.",
    "Do not say phrases like approval needed, summary to owner, record a summary, tool call, or function call. Keep workflow invisible and speak only like a receptionist.",
    "If a system action fails, do not tell the caller there was a data-entry, database, tool, or system issue. Keep taking details and say someone can follow up if needed.",
    "Detect the caller's language and continue in that language when you can. Confirm names, phone numbers, addresses, dates, and times carefully.",
    "Before saving or booking with an address, repeat the street number, street name, city, and state if available, and ask the caller to confirm. If a street name is unclear or could be misspelled, ask the caller to spell it.",
    `Today is ${spokenDateTime(new Date(), timeZone)}. The business timezone is ${timeZone}.`,
    `The owner is ${ownerName}.`,
    `Business hours are ${businessHoursText(business)}. If asked, answer with these hours and then help schedule inside those hours.`,
    "If list_available_slots or book_appointment says a date is closed, politely say sorry, there are no appointments available for that whole day, then ask for another day.",
    serviceAreaInstruction,
    `Only offer and book these services for this business: ${serviceOptions.map(serviceLabel).join(", ")}.`,
    "If the caller asks for a listed service, acknowledge it naturally and ask for the next practical detail, usually the service address or preferred day and time.",
    "If the caller asks for a service not listed, say you can take their details and have someone follow up, but do not book it as a confirmed appointment.",
    "Collect name, phone number if needed, service type, confirmed address, and preferred appointment time one or two details at a time.",
    "Always call list_available_slots before offering times unless the caller asks for a specific time. Never book over an existing calendar event.",
    "Only call book_appointment after the caller clearly agrees to a specific available date and time. This creates an owner approval request, not a final confirmed booking.",
    "After saving a booking request or lead details, ask the caller if there is anything else you can help with.",
    `If the call is business-related but does not result in a booking, silently call record_call_summary before ending the call. Write the tool summary in ${ownerSummaryLanguage(business.owner_summary_language) === "es" ? "Spanish" : "English"}.`,
    "When the caller says no, thanks, thank you, goodbye, that's all, or otherwise clearly has nothing else, call end_call. After end_call, say a short goodbye like 'Okay, I am hanging up now. Have a good day.' and stop talking.",
    "If the caller is personal, a vendor, spam, not a customer, or asks for the owner/human, call transfer_to_owner.",
    "If the caller wants a price quote for a listed service, collect details and offer to schedule a quote appointment inside business hours. Use estimated_value 0 when booking a quote appointment unless a known customer service fee applies.",
    "Do not promise a final price unless a booking value is returned by a tool.",
    "After book_appointment succeeds, tell the caller the request was sent to the owner and they will receive a confirmation text after approval, then ask if there is anything else. Do not say the booking is final until owner approval happens."
  ].join("\n");
}

function createOpenAiSocket() {
  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(OPENAI_MODEL)}`;
  return new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`
    }
  });
}

async function handleToolCall({ call, state, openaiWs, twilioWs }) {
  const args = safeParseJson(call.arguments);
  let output;

  try {
    if (call.name === "list_available_slots") {
      const availability = await availableSlots({
        businessId: state.businessId,
        date: args.date,
        durationMinutes: DEFAULT_SLOT_MINUTES
      });
      output = {
        closed_dates: availability.closedDates,
        ok: true,
        slots: availability.slots,
        time_zone: availability.timeZone || state.business?.booking_time_zone || DEFAULT_TIME_ZONE,
        message: availability.closedDates.length
          ? "Sorry, we don't have any appointments for that whole day. Ask for another day."
          : availability.slots.length
            ? "Offer these openings conversationally."
            : "No openings found for that date. Ask for another day."
      };
    } else if (call.name === "book_appointment") {
      output = await bookAppointment({
        args,
        businessId: state.businessId,
        callerPhone: state.fromPhone,
        callSessionId: state.callSessionId
      });
      if (output.ok) state.finalized = true;
    } else if (call.name === "transfer_to_owner") {
      output = await transferToOwner({
        businessId: state.businessId,
        callSessionId: state.callSessionId,
        callSid: state.callSid,
        reason: args.reason
      });
      if (output.ok) {
        state.finalized = true;
        twilioWs.close(1000, "transferring");
      }
    } else if (call.name === "record_call_summary") {
      output = await recordCallSummary({
        args,
        businessId: state.businessId,
        callerPhone: state.fromPhone,
        callSessionId: state.callSessionId
      });
      if (output.ok) state.finalized = true;
    } else if (call.name === "end_call") {
      state.finalized = true;
      state.pendingHangup = true;
      output = {
        ok: true,
        message: "Say exactly: Okay, I am hanging up now. Have a good day."
      };
    } else {
      output = { ok: false, message: `Unknown tool ${call.name}.` };
    }
  } catch (error) {
    console.error(`Realtime tool ${call.name} failed:`, error);
    output = {
      ok: false,
      message: "I can still take the caller's details for follow-up. Do not mention system, database, tool, or data-entry problems to the caller."
    };
  }

  sendJson(openaiWs, {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: call.call_id,
      output: JSON.stringify(output)
    }
  });

  sendJson(openaiWs, {
    type: "response.create"
  });
}

async function configureRealtimeSession(openaiWs, state) {
  const context = await getBusinessContext(state.businessId);
  state.business = context.business;
  state.owner = context.owner;
  const serviceOptions = businessServiceOptions(context.business);

  sendJson(openaiWs, {
    type: "session.update",
    session: {
      type: "realtime",
      model: OPENAI_MODEL,
      output_modalities: ["audio"],
      instructions: sessionInstructions(context),
      audio: {
        input: {
          format: {
            type: "audio/pcmu"
          },
          turn_detection: {
            type: "server_vad",
            silence_duration_ms: 650
          }
        },
        output: {
          format: {
            type: "audio/pcmu"
          },
          voice: OPENAI_VOICE
        }
      },
      tools: realtimeTools(serviceOptions),
      tool_choice: "auto"
    }
  });
}

function handleTwilioConnection(twilioWs) {
  const state = {
    businessId: null,
    callSessionId: null,
    callSid: null,
    finalized: false,
    fromPhone: null,
    greeted: false,
    hangupTimer: null,
    openaiReady: false,
    pendingHangup: false,
    realtimeFailed: false,
    streamSid: null,
    transcriptParts: []
  };
  const queuedAudio = [];
  let openaiWs;

  try {
    openaiWs = createOpenAiSocket();
  } catch (error) {
    console.error("Could not create OpenAI realtime socket:", error);
    twilioWs.close(1011, "openai configuration failed");
    return;
  }

  openaiWs.on("open", () => {
    state.openaiReady = true;
    while (queuedAudio.length) {
      sendJson(openaiWs, { type: "input_audio_buffer.append", audio: queuedAudio.shift() });
    }
  });

  openaiWs.on("message", async (raw) => {
    const event = safeParseJson(raw.toString(), null);
    if (!event) return;

    if (event.type === "session.created" && state.businessId) {
      await configureRealtimeSession(openaiWs, state).catch((error) => {
        console.error("Could not configure realtime session:", error);
        twilioWs.close(1011, "configuration failed");
      });
      return;
    }

    if (event.type === "session.updated" && !state.greeted) {
      state.greeted = true;
      sendJson(openaiWs, {
        type: "response.create",
        response: {
          instructions: `Greet the caller as ${agentName(state.business)} with ${state.business?.name || "the business"}. Ask how they are today, then ask if they have used the service before. Keep it under two sentences.`
        }
      });
      return;
    }

    if ((event.type === "response.output_audio.delta" || event.type === "response.audio.delta") && event.delta && state.streamSid) {
      sendJson(twilioWs, {
        event: "media",
        streamSid: state.streamSid,
        media: {
          payload: event.delta
        }
      });
      return;
    }

    if (event.type === "input_audio_buffer.speech_started" && state.streamSid) {
      sendJson(twilioWs, { event: "clear", streamSid: state.streamSid });
      return;
    }

    if (event.type === "response.output_audio_transcript.done" && event.transcript) {
      state.transcriptParts.push(`Ana: ${event.transcript}`);
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
      state.transcriptParts.push(`Caller: ${event.transcript}`);
      return;
    }

    if (event.type === "response.done") {
      const calls = event.response?.output?.filter((item) => item.type === "function_call") || [];
      for (const call of calls) {
        await handleToolCall({ call, openaiWs, state, twilioWs });
      }
      if (!calls.length && state.pendingHangup) {
        state.pendingHangup = false;
        scheduleLiveHangup({ state, twilioWs });
      }
      return;
    }

    if (event.type === "error") {
      if (event.error?.code === "response_cancel_not_active") {
        console.warn("Ignoring stale OpenAI realtime cancellation:", event.error.message);
        return;
      }

      console.error("OpenAI realtime error:", event.error || event);
      if (state.realtimeFailed) return;
      state.realtimeFailed = true;
      await failLiveCall({
        message: "Sorry, Ana is temporarily unavailable. Please call back shortly.",
        state,
        twilioWs
      });
    }
  });

  openaiWs.on("error", (error) => {
    console.error("OpenAI websocket error:", error);
    if (state.realtimeFailed) return;
    state.realtimeFailed = true;
    void failLiveCall({
      message: "Sorry, Ana is temporarily unavailable. Please call back shortly.",
      state,
      twilioWs
    });
  });

  openaiWs.on("close", () => {
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
  });

  twilioWs.on("message", async (raw) => {
    const event = safeParseJson(raw.toString(), null);
    if (!event) return;

    if (event.event === "start") {
      state.streamSid = event.streamSid || event.start?.streamSid;
      state.callSid = event.start?.callSid;
      state.businessId = event.start?.customParameters?.businessId;
      state.callSessionId = event.start?.customParameters?.callSessionId;
      state.fromPhone = event.start?.customParameters?.fromPhone;

      if (!state.businessId) {
        twilioWs.close(1008, "missing business id");
        return;
      }

      if (state.openaiReady) {
        await configureRealtimeSession(openaiWs, state).catch((error) => {
          console.error("Could not configure realtime session:", error);
          twilioWs.close(1011, "configuration failed");
        });
      }
      return;
    }

    if (event.event === "media" && event.media?.payload) {
      if (state.openaiReady) {
        sendJson(openaiWs, { type: "input_audio_buffer.append", audio: event.media.payload });
      } else {
        queuedAudio.push(event.media.payload);
      }
      return;
    }

    if (event.event === "stop") {
      twilioWs.close();
    }
  });

  twilioWs.on("close", async () => {
    if (state.hangupTimer) {
      clearTimeout(state.hangupTimer);
      state.hangupTimer = null;
    }
    if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
    if (state.businessId && state.callSessionId) {
      await finishRealtimeCall({
        allowFallbackLead: !state.finalized,
        businessId: state.businessId,
        callSessionId: state.callSessionId,
        outcome: "Realtime voice call ended.",
        transcript: state.transcriptParts.join("\n")
      }).catch((error) => console.error("Could not update call session:", error));
    }
  });
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ model: OPENAI_MODEL, ok: true, voice: OPENAI_VOICE }));
    return;
  }

  if (request.url?.startsWith("/api/twilio/")) {
    void proxyTwilioApiRequest(request, response);
    return;
  }

  response.writeHead(404);
  response.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  if (url.pathname !== "/twilio/voice") {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    handleTwilioConnection(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Oficio realtime voice gateway listening on ws://localhost:${PORT}/twilio/voice`);
  console.log(`Proxying /api/twilio/* HTTP webhooks to ${NEXT_APP_ORIGIN}`);
  console.log(`Using OpenAI model ${OPENAI_MODEL} with voice ${OPENAI_VOICE}`);
});
