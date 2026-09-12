import { db } from "@/lib/db";
import { getAiCapabilityConfig } from "./registry";
import { isAiEnabled } from "./client";
import { getOrganizationAiSpendThisMonthUsd, resolveOrganizationAiBudgetUsd } from "./budget";
import { estimateCostUsd } from "./pricing";
import type { AiActionKey, AiCapabilityConfig } from "./types";
import {
  AiCapabilityDisabledError,
  AiDisabledError,
  AiRequestInProgressError,
  AiUsageLimitExceededError,
} from "./errors";

// Usage tracking, limit enforcement, and duplicate-request prevention
// (req #6, #7, docs/V2-AI-FOUNDATION.md).

// A lock older than this is treated as an abandoned/crashed request and
// cleared before retry, so a crash can never permanently wedge an
// initiative's AI action. Generous relative to typical <60s model latency.
const LOCK_STALE_MS = 3 * 60 * 1000;

/** Pure — no I/O — so it's directly unit-testable. */
export function startOfCurrentMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Pure — no I/O — so it's directly unit-testable. */
export function isOverLimit(count: number, limit: number): boolean {
  return count >= limit;
}

/**
 * The dedup key: the initiative id for an initiative-scoped action (so two
 * different users triggering the same initiative's analysis at once are
 * both serialized against each other, not just double-clicks from one
 * user), else the user id for a future user-scoped action. Pure.
 */
export function deriveScopeKey(params: { userId: string; initiativeId?: string | null }): string {
  return params.initiativeId ?? params.userId;
}

interface AllowedContext {
  capability: AiCapabilityConfig;
  release: () => Promise<void>;
}

export async function assertAiActionAllowed(params: {
  action: AiActionKey;
  userId: string;
  organizationId: string;
  initiativeId?: string | null;
}): Promise<AllowedContext> {
  if (!isAiEnabled()) throw new AiDisabledError("AI features are currently disabled.");

  const capability = await getAiCapabilityConfig(params.action);
  if (!capability || !capability.enabled) {
    throw new AiCapabilityDisabledError(`${params.action} is currently disabled.`);
  }

  const since = startOfCurrentMonthUtc();
  const [userCount, orgCount] = await Promise.all([
    db.aiUsageEvent.count({
      where: { userId: params.userId, action: params.action, createdAt: { gte: since } },
    }),
    db.aiUsageEvent.count({
      where: { organizationId: params.organizationId, action: params.action, createdAt: { gte: since } },
    }),
  ]);
  if (isOverLimit(userCount, capability.userMonthlyLimit)) {
    throw new AiUsageLimitExceededError("You've reached this month's usage limit for this AI action.", "user");
  }
  if (isOverLimit(orgCount, capability.organizationMonthlyLimit)) {
    throw new AiUsageLimitExceededError(
      "Your organization has reached this month's usage limit for this AI action.",
      "organization",
    );
  }

  // $ budget tier (directive §28), on top of the count-based limits above —
  // only enforced when a budget actually resolves (org override, or 4% of a
  // configured platform budget). No configured budget = no $ cap here,
  // matching the directive's explicit correction against a flat reservation.
  const orgBudgetUsd = await resolveOrganizationAiBudgetUsd(params.organizationId);
  if (orgBudgetUsd != null) {
    const spentUsd = await getOrganizationAiSpendThisMonthUsd(params.organizationId);
    if (spentUsd >= orgBudgetUsd) {
      throw new AiUsageLimitExceededError(
        "Your organization has reached its monthly AI budget for this billing period. Existing projects and approved artifacts are still available.",
        "organization",
      );
    }
  }

  const release = await acquireLock({
    scopeKey: deriveScopeKey(params),
    action: params.action,
    userId: params.userId,
    organizationId: params.organizationId,
    initiativeId: params.initiativeId ?? null,
  });

  return { capability, release };
}

async function acquireLock(data: {
  scopeKey: string;
  action: string;
  userId: string;
  organizationId: string;
  initiativeId: string | null;
}): Promise<() => Promise<void>> {
  const existing = await db.aiRequestLock.findUnique({
    where: { scopeKey_action: { scopeKey: data.scopeKey, action: data.action } },
  });
  if (existing) {
    const age = Date.now() - existing.startedAt.getTime();
    if (age < LOCK_STALE_MS) {
      throw new AiRequestInProgressError("A request for this is already processing.");
    }
    // Abandoned lock from a crashed/timed-out request — clear it and proceed.
    await db.aiRequestLock.delete({ where: { id: existing.id } }).catch(() => {});
  }

  try {
    await db.aiRequestLock.create({ data });
  } catch {
    // Unique constraint race — another concurrent request won.
    throw new AiRequestInProgressError("A request for this is already processing.");
  }

  return async () => {
    await db.aiRequestLock.deleteMany({ where: { scopeKey: data.scopeKey, action: data.action } });
  };
}

export async function recordAiUsage(data: {
  userId: string;
  organizationId: string;
  initiativeId?: string | null;
  action: AiActionKey;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}): Promise<{ id: string }> {
  const inputTokens = data.inputTokens ?? 0;
  const outputTokens = data.outputTokens ?? 0;
  return db.aiUsageEvent.create({
    data: {
      userId: data.userId,
      organizationId: data.organizationId,
      initiativeId: data.initiativeId ?? null,
      action: data.action,
      success: data.success,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens),
      errorMessage: data.errorMessage,
    },
    select: { id: true },
  });
}
