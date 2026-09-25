import type { NextResponse } from "next/server";
import type { AiAssistItem } from "@prisma/client";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireProjectApiAccess } from "@/lib/access/projectAccess";
import type { ActorRow } from "@/lib/access/initiativeAccess";

// Shared access check for the item-level AI Assist routes
// (apply/dismiss/mark-applied) — an AiAssistItem is initiative-scoped when
// initiativeId is set, else project-scoped (Section 4's project/initiative
// isolation requirement applies identically to acting on a draft as it does
// to generating one).
export async function requireAiAssistItemAccess(
  actor: ActorRow,
  item: AiAssistItem,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (item.initiativeId) {
    const guard = await requireInitiativeApiAccess(actor, item.initiativeId, "edit");
    if (!guard.ok) return guard;
    return { ok: true };
  }
  return requireProjectApiAccess(actor, item.projectId);
}
