import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { recomputeFingerprintForItem } from "@/lib/ai/assist/recomputeFingerprint";
import type { AiActionKey } from "@/lib/ai/types";

// AI Assist panel's one read (Section 4 §7/§9). Contextual per page — each
// scope maps to the action keys relevant to what the user is currently
// doing, never the full set everywhere (Section 4's "AI Assist should be
// contextual" rule).
const SCOPE_ACTIONS: Record<string, AiActionKey[]> = {
  roadmap: ["ROADMAP_INSIGHTS", "RECOMMEND_RELEASES", "RECOMMEND_STATUS"],
  features: ["PROPOSE_FEATURES", "PROPOSE_STORY_CONTENT", "PROPOSE_DEPENDENCIES", "PROPOSE_RISKS"],
  sprints: ["RECOMMEND_SPRINTS"],
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireInitiativeApiAccess(user, id, "view");
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "";
  const actionKeys = SCOPE_ACTIONS[scope];
  if (!actionKeys) return jsonError("Unknown scope. Use roadmap, features, or sprints.", 400);

  const items = await db.aiAssistItem.findMany({
    where: { initiativeId: id, actionKey: { in: actionKeys } },
    orderBy: { createdAt: "desc" },
  });

  // Live drift check on every load — never a silent regeneration, only a
  // status flip so the panel can offer "this may need an update."
  await Promise.all(
    items
      .filter((item) => item.status === "proposed")
      .map(async (item) => {
        const fresh = await recomputeFingerprintForItem(item);
        if (fresh && fresh !== item.fingerprint) {
          await db.aiAssistItem.update({ where: { id: item.id }, data: { status: "stale" } });
          item.status = "stale";
        }
      }),
  );

  // Refresh-resumability + duplicate-prevention share this one signal
  // (Section 4 §6): a non-terminal AiJob for one of this scope's actions.
  const pendingJobs = await db.aiJob.findMany({
    where: { initiativeId: id, actionKey: { in: actionKeys }, status: { notIn: ["completed", "failed", "cancelled"] } },
    orderBy: { startedAt: "desc" },
    select: { id: true, status: true, actionKey: true },
  });

  return NextResponse.json({ items, pendingJobs });
}
