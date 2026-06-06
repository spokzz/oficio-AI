export type AiCallPlanKey = "basic" | "premium" | "vip";

export type AiCallPlan = {
  allowanceMinutes: number;
  key: AiCallPlanKey;
  label: string;
  monthlyPrice: number;
  overageStartsAtMinutes: number;
  overageRatePerMinute: number;
};

export type AiCallUsage = {
  allowanceMinutes: number;
  billableOverageMinutes: number;
  graceMinutes: number;
  includedUsedMinutes: number;
  monthLabel: string;
  monthStart: string;
  nextMonthStart: string;
  overageAmount: number;
  overageMinutes: number;
  overageRatePerMinute: number | null;
  overageStartsAtMinutes: number;
  planKey: AiCallPlanKey;
  planName: string;
  remainingMinutes: number;
  usagePercent: number;
  usedMinutes: number;
};

const aiCallPlans: Record<AiCallPlanKey, AiCallPlan> = {
  basic: {
    allowanceMinutes: 100,
    key: "basic",
    label: "Basic",
    monthlyPrice: 79,
    overageStartsAtMinutes: 110,
    overageRatePerMinute: 0.49
  },
  premium: {
    allowanceMinutes: 300,
    key: "premium",
    label: "Premium",
    monthlyPrice: 149,
    overageStartsAtMinutes: 320,
    overageRatePerMinute: 0.39
  },
  vip: {
    allowanceMinutes: 750,
    key: "vip",
    label: "VIP",
    monthlyPrice: 249,
    overageStartsAtMinutes: 800,
    overageRatePerMinute: 0.29
  }
};

export const aiCallPlanOptions = Object.values(aiCallPlans);

export function normalizeAiCallPlan(planName?: string | null): AiCallPlan {
  const normalized = String(planName ?? "").trim().toLowerCase();

  if (normalized.includes("vip")) return aiCallPlans.vip;
  if (normalized.includes("basic") || normalized.includes("básico") || normalized.includes("basico")) return aiCallPlans.basic;
  if (normalized.includes("premium") || normalized.includes("growth")) return aiCallPlans.premium;

  return aiCallPlans.basic;
}

export function monthWindow(referenceDate = new Date()) {
  const monthStart = new Date(referenceDate);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

  return {
    monthLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric"
    }).format(monthStart),
    monthStart,
    nextMonthStart
  };
}

export function buildAiCallUsage({
  allowanceMinutes,
  overageStartsAtMinutes,
  overageRatePerMinute,
  planName,
  referenceDate = new Date(),
  usedMinutes
}: {
  allowanceMinutes?: number | null;
  overageStartsAtMinutes?: number | null;
  overageRatePerMinute?: number | null;
  planName?: string | null;
  referenceDate?: Date;
  usedMinutes: number;
}): AiCallUsage {
  const plan = normalizeAiCallPlan(planName);
  const selectedAllowance =
    allowanceMinutes !== null &&
    allowanceMinutes !== undefined &&
    Number.isFinite(Number(allowanceMinutes)) &&
    Number(allowanceMinutes) >= 0
      ? Number(allowanceMinutes)
      : plan.allowanceMinutes;
  const selectedOverageRate =
    overageRatePerMinute !== null &&
    overageRatePerMinute !== undefined &&
    Number.isFinite(Number(overageRatePerMinute)) &&
    Number(overageRatePerMinute) >= 0
      ? Number(overageRatePerMinute)
      : plan.overageRatePerMinute;
  const selectedOverageThreshold =
    overageStartsAtMinutes !== null &&
    overageStartsAtMinutes !== undefined &&
    Number.isFinite(Number(overageStartsAtMinutes)) &&
    Number(overageStartsAtMinutes) >= selectedAllowance
      ? Number(overageStartsAtMinutes)
      : Math.max(selectedAllowance, plan.overageStartsAtMinutes);
  const safeUsedMinutes = Number.isFinite(usedMinutes) ? Math.max(0, usedMinutes) : 0;
  const overageMinutes = Math.max(0, safeUsedMinutes - selectedOverageThreshold);
  const billableOverageMinutes = overageMinutes;
  const { monthLabel, monthStart, nextMonthStart } = monthWindow(referenceDate);

  return {
    allowanceMinutes: selectedAllowance,
    billableOverageMinutes,
    graceMinutes: selectedOverageThreshold - selectedAllowance,
    includedUsedMinutes: Math.min(safeUsedMinutes, selectedAllowance),
    monthLabel,
    monthStart: monthStart.toISOString(),
    nextMonthStart: nextMonthStart.toISOString(),
    overageAmount: billableOverageMinutes * selectedOverageRate,
    overageMinutes,
    overageRatePerMinute: selectedOverageRate,
    overageStartsAtMinutes: selectedOverageThreshold,
    planKey: plan.key,
    planName: plan.label,
    remainingMinutes: Math.max(0, selectedAllowance - safeUsedMinutes),
    usagePercent: selectedAllowance > 0 ? Math.min(100, (safeUsedMinutes / selectedAllowance) * 100) : 0,
    usedMinutes: safeUsedMinutes
  };
}

export function sumUsageMinutes(rows: Array<{ quantity: number | string | null }>) {
  return rows.reduce((sum, row) => {
    const quantity = Number(row.quantity ?? 0);
    return Number.isFinite(quantity) ? sum + quantity : sum;
  }, 0);
}
