import { NextResponse } from "next/server";
import { requireDocumentApiAccess } from "@/lib/access/documentAccess";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { detectGaps } from "@/lib/context/contextFields";
import { resolveContextReadiness } from "@/lib/context/resolveContextReadiness";
import { loadCurrentContextValues } from "@/lib/context/loadCurrentValues";

// Document Import & Approved Context (directive items 12/15/33) — the
// review screen's data source: every ContextItem this document proposed,
// plus the current gap list and readiness (directive item 33), so the
// client never has to separately reconstruct either. `fileBytes`/
// `extractedChunksJson` are deliberately excluded from the response — large
// and not needed by the review UI.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireDocumentApiAccess(user, id, "view");
  if (!guard.ok) return guard.response;
  const document = guard.row;

  // conflictWithItem may belong to a DIFFERENT document (a cross-document
  // conflict, directive item 13) — included here so the review screen can
  // render both sides of the pick-A/pick-B choice without a second fetch.
  const items = await db.contextItem.findMany({
    where: { documentId: id },
    orderBy: { createdAt: "asc" },
    include: { conflictWithItem: true },
  });

  const { display } = await loadCurrentContextValues({
    projectId: document.projectId,
    initiativeId: document.initiativeId,
  });
  const approvedFieldKeys = new Set(
    items.filter((i) => i.status === "approved").map((i) => i.fieldKey),
  );
  const gaps = detectGaps(document.initiativeId ? "initiative" : "project", display, approvedFieldKeys);
  const readiness = resolveContextReadiness({
    gaps,
    pendingConflictCount: items.filter((i) => i.status === "conflict").length,
    pendingNeedsReviewCount: items.filter((i) => i.status === "needs_review" || i.status === "needs_clarification")
      .length,
  });

  return NextResponse.json({
    document: {
      id: document.id,
      fileName: document.fileName,
      fileExt: document.fileExt,
      scope: document.scope,
      status: document.status,
      processingError: document.processingError,
      createdAt: document.createdAt,
    },
    items,
    gaps,
    readiness,
  });
}
