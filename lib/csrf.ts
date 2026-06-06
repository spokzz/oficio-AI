import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const CSRF_FIELD_NAME = "csrfToken";

const TOKEN_TTL_MS = 60 * 60 * 1000;

type CsrfPayload = {
  exp: number;
  nonce: string;
  userId: string;
};

function csrfSecret() {
  const secret = process.env.CSRF_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("CSRF_SECRET must be configured in production.");
  }

  return secret || "oficio-local-csrf-development-secret";
}

function signPayload(payload: string) {
  return createHmac("sha256", csrfSecret()).update(payload).digest("base64url");
}

function sameSignature(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createCsrfToken(userId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      exp: Date.now() + TOKEN_TTL_MS,
      nonce: randomUUID(),
      userId
    } satisfies CsrfPayload)
  ).toString("base64url");

  return `${payload}.${signPayload(payload)}`;
}

function verifyCsrfToken(token: string, userId: string) {
  const [payload, signature, extra] = token.split(".");

  if (!payload || !signature || extra) {
    return false;
  }

  if (!sameSignature(signature, signPayload(payload))) {
    return false;
  }

  let parsed: CsrfPayload;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CsrfPayload;
  } catch {
    return false;
  }

  return parsed.userId === userId && Number.isFinite(parsed.exp) && parsed.exp >= Date.now();
}

export async function validateCurrentUserCsrfToken(token: string | null | undefined) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user || !token || !verifyCsrfToken(token, user.id)) {
    return "Security check failed. Refresh the page and try again.";
  }

  return null;
}

export async function validateFormCsrfToken(formData: FormData) {
  return validateCurrentUserCsrfToken(String(formData.get(CSRF_FIELD_NAME) ?? ""));
}
