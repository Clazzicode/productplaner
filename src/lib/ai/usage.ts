import { db } from "@/lib/db";
import { getAiCapabilityConfig } from "./registry";
import { isAiEnabled } from "./client";
import { getOrganizationAiSpendThisMonthUsd, resolveOrganizationAiBudgetUsd } from "./budget";
import { estimateCostUsd } from "./pricing";
import { completeAiJob, createAiJob, failAiJob } from "./job";
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
  jobId: string;
}

export async function assertAiActionAllowed(params: {
  action: AiActionKey;
  userId: string;
  organizationId: string;
  initiativeId?: string | null;
  projectId?: string | null;
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

  const jobId = await createAiJob({
    organizationId: params.organizationId,
    createdByUserId: params.userId,
    actionKey: params.action,
    projectId: params.projectId ?? null,
    initiativeId: params.initiativeId ?? null,
  });

  return { capability, release, jobId };
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
  // Section 5 §21 — direct project scoping, and the artifact this event
  // created or reused, without going through the AiJob indirection.
  projectId?: string | null;
  aiAssistItemId?: string | null;
  action: AiActionKey;
  success: boolean;
  // Section 5 §22 — "generation" (a real Anthropic call happened) vs
  // "reuse" (the fingerprint reuse gate served an existing artifact, no
  // call made). Defaults to "generation" so every pre-Section-5 call site
  // keeps working unchanged.
  kind?: "generation" | "reuse";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  errorMessage?: string;
  aiJobId?: string | null;
  resultSummary?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const inputTokens = data.inputTokens ?? 0;
  const outputTokens = data.outputTokens ?? 0;
  const cacheCreationInputTokens = data.cacheCreationInputTokens ?? 0;
  const cacheReadInputTokens = data.cacheReadInputTokens ?? 0;
  const event = await db.aiUsageEvent.create({
    data: {
      userId: data.userId,
      organizationId: data.organizationId,
      initiativeId: data.initiativeId ?? null,
      projectId: data.projectId ?? null,
      aiAssistItemId: data.aiAssistItemId ?? null,
      aiJobId: data.aiJobId ?? null,
      action: data.action,
      kind: data.kind ?? "generation",
      model: data.model ?? "",
      success: data.success,
      inputTokens,
      outputTokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
      estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens),
      errorMessage: data.errorMessage,
    },
    select: { id: true },
  });

  // Retries (e.g. analyzeIntake.ts's malformed-response retry loop) call this
  // more than once per job — a later success overwrites an earlier attempt's
  // "failed" mark, which is the outcome that actually matters. Awaited (not
  // fire-and-forget) since this runs in short-lived serverless functions that
  // can be frozen right after returning a response.
  if (data.aiJobId) {
    if (data.success) {
      await completeAiJob(data.aiJobId, data.resultSummary ?? {});
    } else {
      await failAiJob(data.aiJobId, data.errorMessage ?? "AI request failed.");
    }
  }

  return event;
}
