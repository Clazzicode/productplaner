import { db } from "@/lib/db";
import { startOfCurrentMonthUtc } from "./usage";
import { getOrganizationAiUsageStatus } from "./budget";

// Section 5 §33 — usage reporting foundation (backend only; no UI page this
// pass, per §33's explicit "don't let dashboard work block the core
// usage-control functionality"). One grouped aggregate over AiUsageEvent —
// the only aggregation query in this codebase beyond budget.ts's single
// org-wide sum — plus the existing budget/threshold status for context.

export interface ActionUsageSummary {
  action: string;
  generationCount: number;
  reuseCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  estimatedCostUsd: number;
}

export interface OrganizationUsageSummary {
  budgetUsd: number | null;
  spentUsd: number;
  percentUsed: number | null;
  warningLevel: string | null;
  byAction: ActionUsageSummary[];
  totalGenerations: number;
  totalReuseHits: number;
  totalEstimatedCostUsd: number;
  /** ESTIMATE ONLY, for operational reporting — never precise accounting.
   * Derived as (each action's own average real-generation cost this period)
   * x (that action's reuse-hit count this period), summed across actions.
   * A reuse hit costs $0 for real, so this is "roughly what those calls
   * would have cost had the reuse gate not served an existing artifact,"
   * not a refund, credit, or billed amount. */
  estimatedCostAvoidedUsd: number;
}

export async function getOrganizationUsageSummary(
  organizationId: string,
  opts?: { monthStart?: Date },
): Promise<OrganizationUsageSummary> {
  const since = opts?.monthStart ?? startOfCurrentMonthUtc();

  const [status, grouped] = await Promise.all([
    getOrganizationAiUsageStatus(organizationId),
    db.aiUsageEvent.groupBy({
      by: ["action", "kind"],
      where: { organizationId, createdAt: { gte: since } },
      _sum: { inputTokens: true, outputTokens: true, cacheReadInputTokens: true, estimatedCostUsd: true },
      _count: true,
    }),
  ]);

  const byActionMap = new Map<string, ActionUsageSummary>();
  for (const row of grouped) {
    const existing = byActionMap.get(row.action) ?? {
      action: row.action,
      generationCount: 0,
      reuseCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      estimatedCostUsd: 0,
    };
    if (row.kind === "reuse") existing.reuseCount += row._count;
    else existing.generationCount += row._count;
    existing.inputTokens += row._sum.inputTokens ?? 0;
    existing.outputTokens += row._sum.outputTokens ?? 0;
    existing.cacheReadInputTokens += row._sum.cacheReadInputTokens ?? 0;
    existing.estimatedCostUsd += Number(row._sum.estimatedCostUsd ?? 0);
    byActionMap.set(row.action, existing);
  }
  const byAction = [...byActionMap.values()].sort((a, b) => a.action.localeCompare(b.action));

  const totalGenerations = byAction.reduce((sum, a) => sum + a.generationCount, 0);
  const totalReuseHits = byAction.reduce((sum, a) => sum + a.reuseCount, 0);
  const totalEstimatedCostUsd = byAction.reduce((sum, a) => sum + a.estimatedCostUsd, 0);

  const estimatedCostAvoidedUsd = byAction.reduce((sum, a) => {
    if (a.generationCount === 0 || a.reuseCount === 0) return sum;
    const avgCostPerGeneration = a.estimatedCostUsd / a.generationCount;
    return sum + avgCostPerGeneration * a.reuseCount;
  }, 0);

  return {
    budgetUsd: status.budgetUsd,
    spentUsd: status.spentUsd,
    percentUsed: status.percentUsed,
    warningLevel: status.warningLevel,
    byAction,
    totalGenerations,
    totalReuseHits,
    totalEstimatedCostUsd,
    estimatedCostAvoidedUsd,
  };
}
