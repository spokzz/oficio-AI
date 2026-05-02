export function normalizePhone(phone: string | null | undefined) {
  if (!phone) return null;

  const trimmed = phone.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

export function phoneSearchValues(phone: string | null | undefined) {
  const normalized = normalizePhone(phone);
  const raw = phone?.trim();
  return Array.from(new Set([normalized, raw].filter((value): value is string => Boolean(value))));
}
