import { db } from "@/lib/db";
import type { AiAssistItem } from "@prisma/client";

// Reuse-before-regenerate (Section 4 §4/§30/§31). Pure decision function
// first (unit-testable without a database, mirrors hasRoadmapDrifted's
// read-only-signal style), then a thin DB-backed wrapper every AI Assist
// trigger route calls before spending an AI call.

export type ReuseDecision = "generate_new" | "reuse" | "flag_stale";

export function decideReuse(params: {
  existingFingerprint: string | null;
  existingStatus: string | null;
  freshFingerprint: string;
}): ReuseDecision {
  if (params.existingFingerprint == null || params.existingStatus == null) return "generate_new";
  if (params.existingFingerprint === params.freshFingerprint) return "reuse";
  // A still-open, unresolved item (proposed, or already flagged stale from
  // an earlier drift) whose inputs moved on stays flagged stale — never
  // silently regenerated, no matter how many times the context changes
  // before the user acts. An item the user already applied/dismissed/
  // superseded is a settled historical decision — left alone; an explicit
  // re-trigger becomes a new version instead (see the calling action module).
  if (params.existingStatus === "proposed" || params.existingStatus === "stale") return "flag_stale";
  return "generate_new";
}

export interface ResolveReuseParams {
  actionKey: string;
  targetType: string;
  /** `undefined` = match the most recent row of this targetType regardless
   * of targetId (propose-dependencies: candidates each carry their own pair
   * targetId, so the reuse gate checks the whole category's last-generated
   * fingerprint instead of one fixed slot). `null`/a real id filter exactly,
   * same as everywhere else. */
  targetId: string | null | undefined;
  initiativeId: string | null;
  projectId: string;
  freshFingerprint: string;
}

export interface ResolveReuseResult {
  decision: ReuseDecision;
  existingItem: AiAssistItem | null;
}

export async function resolveReuseDecision(params: ResolveReuseParams): Promise<ResolveReuseResult> {
  const existing = await db.aiAssistItem.findFirst({
    where: {
      actionKey: params.actionKey,
      targetType: params.targetType,
      ...(params.targetId !== undefined ? { targetId: params.targetId } : {}),
      initiativeId: params.initiativeId,
      projectId: params.projectId,
    },
    orderBy: { version: "desc" },
  });

  const decision = decideReuse({
    existingFingerprint: existing?.fingerprint ?? null,
    existingStatus: existing?.status ?? null,
    freshFingerprint: params.freshFingerprint,
  });

  if (decision === "flag_stale" && existing && existing.status !== "stale") {
    await db.aiAssistItem.update({ where: { id: existing.id }, data: { status: "stale" } });
  }

  return { decision, existingItem: existing };
}
