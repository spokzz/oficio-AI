export type AiCallPlanKey = "basic" | "premium" | "vip";

export type AiCallPlan = {
  allowanceMinutes: number;
  key: AiCallPlanKey;
  label: string;
  overageRatePerMinute: number | null;
};

export type AiCallUsage = {
  allowanceMinutes: number;
  billableOverageMinutes: number;
  includedUsedMinutes: number;
  monthLabel: string;
  monthStart: string;
  nextMonthStart: string;
  overageAmount: number;
  overageMinutes: number;
  overageRatePerMinute: number | null;
  planKey: AiCallPlanKey;
  planName: string;
  remainingMinutes: number;
  usagePercent: number;
  usedMinutes: number;
};

export const aiCallPlans: Record<AiCallPlanKey, AiCallPlan> = {
  basic: {
    allowanceMinutes: 100,
    key: "basic",
    label: "Basic",
    overageRatePerMinute: null
  },
  premium: {
    allowanceMinutes: 300,
    key: "premium",
    label: "Premium",
    overageRatePerMinute: null
  },
  vip: {
    allowanceMinutes: 600,
    key: "vip",
    label: "VIP",
    overageRatePerMinute: 0.05
  }
};

export const aiCallPlanOptions = Object.values(aiCallPlans);

export function normalizeAiCallPlan(planName?: string | null): AiCallPlan {
  const normalized = String(planName ?? "").trim().toLowerCase();

  if (normalized.includes("vip")) return aiCallPlans.vip;
  if (normalized.includes("basic")) return aiCallPlans.basic;
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
  planName,
  referenceDate = new Date(),
  usedMinutes
}: {
  planName?: string | null;
  referenceDate?: Date;
  usedMinutes: number;
}): AiCallUsage {
  const plan = normalizeAiCallPlan(planName);
  const safeUsedMinutes = Number.isFinite(usedMinutes) ? Math.max(0, usedMinutes) : 0;
  const overageMinutes = Math.max(0, safeUsedMinutes - plan.allowanceMinutes);
  const billableOverageMinutes = plan.overageRatePerMinute ? overageMinutes : 0;
  const { monthLabel, monthStart, nextMonthStart } = monthWindow(referenceDate);

  return {
    allowanceMinutes: plan.allowanceMinutes,
    billableOverageMinutes,
    includedUsedMinutes: Math.min(safeUsedMinutes, plan.allowanceMinutes),
    monthLabel,
    monthStart: monthStart.toISOString(),
    nextMonthStart: nextMonthStart.toISOString(),
    overageAmount: billableOverageMinutes * (plan.overageRatePerMinute ?? 0),
    overageMinutes,
    overageRatePerMinute: plan.overageRatePerMinute,
    planKey: plan.key,
    planName: plan.label,
    remainingMinutes: Math.max(0, plan.allowanceMinutes - safeUsedMinutes),
    usagePercent: plan.allowanceMinutes > 0 ? Math.min(100, (safeUsedMinutes / plan.allowanceMinutes) * 100) : 0,
    usedMinutes: safeUsedMinutes
  };
}

export function sumUsageMinutes(rows: Array<{ quantity: number | string | null }>) {
  return rows.reduce((sum, row) => {
    const quantity = Number(row.quantity ?? 0);
    return Number.isFinite(quantity) ? sum + quantity : sum;
  }, 0);
}
