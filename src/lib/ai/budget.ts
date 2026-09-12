// Tiered usage/cost budgets (directive §28/§29). Platform Monthly Budget ->
// Account Monthly Budget -> Per-Job Limit (AiCapability.maxOutputTokens,
// already enforced per-request in usage.ts) -> Per-Generation Output Limit
// (same field). This module adds the two $ tiers on top of the existing
// count-based per-action limits — it doesn't replace them.

import { db } from "@/lib/db";
import { startOfCurrentMonthUtc } from "./usage";

/** Platform-wide monthly AI budget, in USD — an env var (like AI_ENABLED's
 * kill switch), not a DB row: it's an operator-level setting, and must keep
 * working even if the database is briefly unreachable. Unset = no platform
 * budget configured, which per directive §28 means NO org gets a default 4%
 * reservation either — never a flat reservation with nothing to be 4% of. */
export function getPlatformAiMonthlyBudgetUsd(): number | null {
  const raw = process.env.PLATFORM_AI_MONTHLY_BUDGET_USD;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DEFAULT_ORG_SHARE_OF_PLATFORM_BUDGET = 0.04;

/** Organization.aiMonthlyBudgetUsd if explicitly set; otherwise 4% of the
 * platform budget IF one is configured; otherwise null (no $ cap — the
 * existing per-action count limits in usage.ts still apply regardless). */
export async function resolveOrganizationAiBudgetUsd(organizationId: string): Promise<number | null> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { aiMonthlyBudgetUsd: true } });
  if (org?.aiMonthlyBudgetUsd != null) return org.aiMonthlyBudgetUsd;
  const platformBudget = getPlatformAiMonthlyBudgetUsd();
  return platformBudget != null ? platformBudget * DEFAULT_ORG_SHARE_OF_PLATFORM_BUDGET : null;
}

export async function getOrganizationAiSpendThisMonthUsd(organizationId: string): Promise<number> {
  const since = startOfCurrentMonthUtc();
  const result = await db.aiUsageEvent.aggregate({
    where: { organizationId, createdAt: { gte: since } },
    _sum: { estimatedCostUsd: true },
  });
  return result._sum.estimatedCostUsd ?? 0;
}

export type AiUsageWarningLevel = "70" | "80" | "90" | "100" | null;

/** Pure — directive §29's exact graduated thresholds, nothing invented. */
export function usageWarningLevel(percentUsed: number): AiUsageWarningLevel {
  if (percentUsed >= 100) return "100";
  if (percentUsed >= 90) return "90";
  if (percentUsed >= 70) return "70"; // covers the directive's combined "70-80%" band
  return null;
}

export interface AiUsageStatus {
  budgetUsd: number | null;
  spentUsd: number;
  percentUsed: number | null;
  warningLevel: AiUsageWarningLevel;
}

export async function getOrganizationAiUsageStatus(organizationId: string): Promise<AiUsageStatus> {
  const [budgetUsd, spentUsd] = await Promise.all([
    resolveOrganizationAiBudgetUsd(organizationId),
    getOrganizationAiSpendThisMonthUsd(organizationId),
  ]);
  const percentUsed = budgetUsd && budgetUsd > 0 ? (spentUsd / budgetUsd) * 100 : null;
  return {
    budgetUsd,
    spentUsd,
    percentUsed,
    warningLevel: percentUsed != null ? usageWarningLevel(percentUsed) : null,
  };
}

/** Directive §29's exact copy per threshold — never a blank/generic message. */
export const AI_USAGE_WARNING_COPY: Record<Exclude<AiUsageWarningLevel, null>, string> = {
  "70": "Your organization is approaching its monthly AI usage allowance.",
  "80": "Your organization is approaching its monthly AI usage allowance.",
  "90": "AI usage is nearly at the monthly limit. Saved planning work remains available.",
  "100": "Your AI usage limit has been reached for this billing period. Existing projects and approved artifacts are still available.",
};
