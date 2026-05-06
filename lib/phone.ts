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

export function formatPhone(phone: string | null | undefined) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(+1) ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return normalized;
}
