// Project access — deliberately simpler than InitiativeAccess's owner/edit/view
// grant model (docs/V2-RESOURCE-ACCESS.md's "don't multiply grant surfaces
// without a concrete need" principle, applied to the new Project layer): a
// Project is a shared context container, not an independently-permissioned
// deliverable, so visibility/edit is just "active member of the owning org" —
// the same is_org_member() check RLS enforces at the database layer. The
// fine-grained control that matters (who can edit which deliverable) stays at
// InitiativeAccess, unchanged.

import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { ActorRow } from "./initiativeAccess";

/** Never a distinguishable "forbidden" for cross-org — matches
 * getResolvedAccess()'s "not_found" convention (docs/V2-RESOURCE-ACCESS.md §17):
 * a guessed UUID for another org's Project must look identical to one that
 * doesn't exist at all. */
export async function getProjectOrgId(projectId: string): Promise<string | "not_found"> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
  if (!project) return "not_found";
  return project.organizationId;
}

/** Page guard — notFound() for a missing/cross-org Project, same
 * never-distinguishable-from-doesn't-exist convention as requireInitiativeView. */
export async function requireProjectPageAccess(actor: ActorRow, projectId: string): Promise<void> {
  if (actor.status !== "active") notFound();
  const orgId = await getProjectOrgId(projectId);
  if (orgId === "not_found" || orgId !== actor.organizationId) notFound();
}

export async function requireProjectApiAccess(
  actor: ActorRow,
  projectId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (actor.status !== "active") {
    return { ok: false, response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }
  const orgId = await getProjectOrgId(projectId);
  if (orgId === "not_found" || orgId !== actor.organizationId) {
    return { ok: false, response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }
  return { ok: true };
}

/** Every Project in the user's organization — the Projects Home list. */
export async function listOrganizationProjectIds(actor: ActorRow): Promise<string[]> {
  if (actor.status !== "active") return [];
  const rows = await db.project.findMany({ where: { organizationId: actor.organizationId }, select: { id: true } });
  return rows.map((r) => r.id);
}
