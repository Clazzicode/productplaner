import { NextResponse } from "next/server";
import type { ActorRow } from "./initiativeAccess";
import { requireInitiativeApiAccess } from "./guards";
import { requireProjectApiAccess } from "./projectAccess";
import { db } from "@/lib/db";

// Document Import & Approved Context (directive §3/§5). Never a new
// authorization concept — a Document/ContextItem's access is exactly its
// owning Project's (project_shared) or Initiative's (initiative_only)
// access, delegated to the existing guards. Loads the row once and hands it
// back on success so callers don't need a second query.

type ApiGuardResult<T> = { ok: true; row: T } | { ok: false; response: NextResponse };

async function guardByScope(
  actor: ActorRow,
  scope: { projectId: string; initiativeId: string | null },
  level: "view" | "edit",
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (scope.initiativeId) {
    const guard = await requireInitiativeApiAccess(actor, scope.initiativeId, level);
    return guard.ok ? { ok: true } : guard;
  }
  const guard = await requireProjectApiAccess(actor, scope.projectId);
  return guard.ok ? { ok: true } : guard;
}

export async function requireDocumentApiAccess(
  actor: ActorRow,
  documentId: string,
  level: "view" | "edit" = "edit",
): Promise<ApiGuardResult<NonNullable<Awaited<ReturnType<typeof db.document.findUnique>>>>> {
  const document = await db.document.findUnique({ where: { id: documentId } });
  if (!document) return { ok: false, response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const guard = await guardByScope(actor, { projectId: document.projectId, initiativeId: document.initiativeId }, level);
  if (!guard.ok) return guard;
  return { ok: true, row: document };
}

export async function requireContextItemApiAccess(
  actor: ActorRow,
  contextItemId: string,
  level: "view" | "edit" = "edit",
): Promise<ApiGuardResult<NonNullable<Awaited<ReturnType<typeof db.contextItem.findUnique>>>>> {
  const item = await db.contextItem.findUnique({ where: { id: contextItemId } });
  if (!item) return { ok: false, response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const guard = await guardByScope(actor, { projectId: item.projectId, initiativeId: item.initiativeId }, level);
  if (!guard.ok) return guard;
  return { ok: true, row: item };
}
