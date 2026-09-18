import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireDocumentApiAccess } from "@/lib/access/documentAccess";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import {
  AiCapabilityDisabledError,
  AiDisabledError,
  AiRequestInProgressError,
  AiUsageLimitExceededError,
} from "@/lib/ai/errors";
import { runDocumentUnderstanding } from "@/lib/ai/actions/documentUnderstanding";
import { buildContextItems, type CandidateItem, type PendingItemSummary } from "@/lib/context/conflictDetection";
import { loadCurrentContextValues } from "@/lib/context/loadCurrentValues";
import { extractDocumentChunks, type DocumentChunk } from "@/lib/documents/extractChunks";

// Document Import & Approved Context (directive items 6/7/8/9/13/14/37/38).
// Split from upload (POST .../documents) on purpose: retrying after a
// failure never re-uploads, it just re-POSTs here against the same stored
// fileBytes. Extraction is skipped if it already succeeded on a prior
// attempt (extractedChunksJson already set) — only the AI step re-runs.
async function POSTHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireDocumentApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;
  const document = guard.row;

  if (document.status === "analyzed") {
    return jsonError(
      "This document has already been analyzed — upload a new version to add updated facts.",
      409,
    );
  }

  let chunks: DocumentChunk[];
  if (document.extractedChunksJson) {
    chunks = JSON.parse(document.extractedChunksJson) as DocumentChunk[];
  } else {
    try {
      chunks = await extractDocumentChunks(Buffer.from(document.fileBytes));
    } catch {
      await db.document.update({
        where: { id },
        data: { status: "failed", processingError: "Could not read that file — it may be corrupted or password-protected." },
      });
      return jsonError("Could not read that file — it may be corrupted or password-protected.", 422);
    }
    if (chunks.length === 0) {
      await db.document.update({
        where: { id },
        data: { status: "failed", processingError: "No readable text was found in that document." },
      });
      return jsonError("No readable text was found in that document.", 422);
    }
    await db.document.update({
      where: { id },
      data: { status: "extracted", extractedChunksJson: JSON.stringify(chunks) },
    });
  }

  let extraction;
  try {
    extraction = await runDocumentUnderstanding({
      chunks,
      documentScope: document.scope as "project_shared" | "initiative_only",
      initiativeId: document.initiativeId,
      projectId: document.projectId,
      userId: user.id,
      organizationId: user.organizationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not analyze that document.";
    await db.document.update({ where: { id }, data: { status: "failed", processingError: message } });
    if (err instanceof AiDisabledError) return jsonError(message, 503);
    if (err instanceof AiCapabilityDisabledError) return jsonError(message, 403);
    if (err instanceof AiUsageLimitExceededError) return jsonError(message, 429);
    if (err instanceof AiRequestInProgressError) return jsonError(message, 409);
    return jsonError(message, 502);
  }

  // Current real values to conflict-check against — scoped by whether this
  // document is project-level or initiative-level. team/constraints/
  // stakeholders are deliberately absent from `scalar`: they're append-only
  // lists (see crystallize.ts), never a single value to conflict against.
  const { snapshot: currentSnapshot } = await loadCurrentContextValues({
    projectId: document.projectId,
    initiativeId: document.initiativeId,
  });

  const pendingRows = await db.contextItem.findMany({
    where: {
      projectId: document.projectId,
      initiativeId: document.initiativeId,
      documentId: { not: document.id },
      status: { in: ["extracted", "needs_review", "conflict", "needs_clarification"] },
    },
    select: { id: true, fieldKey: true, valueJson: true },
  });
  const pending: PendingItemSummary[] = pendingRows.map((p) => ({
    id: p.id,
    fieldKey: p.fieldKey,
    // Scalar fields store their comparable value directly in valueJson;
    // feature/risk pending rows are excluded from scalar matching by
    // conflictDetection's own open-ended-field branch (it reads `value` only
    // for the dedupe check there, via JSON-parsed name/description).
    value: safeScalarOrName(p.fieldKey, p.valueJson),
  }));

  const chunkExcerpt = (index: number) => chunks[index]?.text.slice(0, 400) ?? "";
  const chunkMeta = (index: number) => chunks[index];

  const candidates: (CandidateItem & { valueJson: string })[] = [
    ...extraction.items.map((item) => ({
      fieldKey: item.fieldKey,
      kind: item.kind,
      scope: item.scope,
      value: item.value,
      valueJson: item.value,
      sourceExcerpt: chunkExcerpt(item.sourceChunkIndex),
      sourceChunkIndex: item.sourceChunkIndex,
      sourceHeading: chunkMeta(item.sourceChunkIndex)?.closestHeading ?? null,
      sourcePageNumber: chunkMeta(item.sourceChunkIndex)?.pageNumber ?? null,
      sourceSlideNumber: chunkMeta(item.sourceChunkIndex)?.slideNumber ?? null,
    })),
    ...extraction.features.map((feature) => ({
      fieldKey: "feature",
      kind: feature.kind,
      scope: "initiative" as const,
      value: feature.name,
      valueJson: JSON.stringify(feature),
      sourceExcerpt: chunkExcerpt(feature.sourceChunkIndex),
      sourceChunkIndex: feature.sourceChunkIndex,
      sourceHeading: chunkMeta(feature.sourceChunkIndex)?.closestHeading ?? null,
      sourcePageNumber: chunkMeta(feature.sourceChunkIndex)?.pageNumber ?? null,
      sourceSlideNumber: chunkMeta(feature.sourceChunkIndex)?.slideNumber ?? null,
    })),
    ...extraction.risks.map((risk) => ({
      fieldKey: "risk",
      kind: risk.kind,
      scope: document.initiativeId ? ("initiative" as const) : ("project" as const),
      value: risk.description,
      valueJson: JSON.stringify(risk),
      sourceExcerpt: chunkExcerpt(risk.sourceChunkIndex),
      sourceChunkIndex: risk.sourceChunkIndex,
      sourceHeading: chunkMeta(risk.sourceChunkIndex)?.closestHeading ?? null,
      sourcePageNumber: chunkMeta(risk.sourceChunkIndex)?.pageNumber ?? null,
      sourceSlideNumber: chunkMeta(risk.sourceChunkIndex)?.slideNumber ?? null,
    })),
  ];

  const { toCreate } = buildContextItems({
    candidates,
    current: currentSnapshot,
    pending,
  });

  await withTransaction(async (tx) => {
    for (const built of toCreate) {
      const source = candidates[built.tempId];
      const row = await tx.contextItem.create({
        data: {
          organizationId: user.organizationId,
          projectId: document.projectId,
          initiativeId: document.initiativeId,
          documentId: document.id,
          fieldKey: built.candidate.fieldKey,
          kind: built.candidate.kind,
          valueJson: source.valueJson,
          sourceExcerpt: built.candidate.sourceExcerpt,
          sourceChunkIndex: built.candidate.sourceChunkIndex,
          sourceHeading: built.candidate.sourceHeading,
          sourcePageNumber: built.candidate.sourcePageNumber,
          sourceSlideNumber: built.candidate.sourceSlideNumber,
          status: built.status,
          conflictsWithExistingValueText: built.conflictsWithExistingValueText,
          conflictWithItemId: null, // linked below once both sides have real ids
        },
        select: { id: true },
      });
      if (built.conflictsWithPendingItemId) {
        await tx.contextItem.update({ where: { id: row.id }, data: { conflictWithItemId: built.conflictsWithPendingItemId } });
        await tx.contextItem.update({
          where: { id: built.conflictsWithPendingItemId },
          data: { status: "conflict", conflictWithItemId: row.id },
        });
      }
    }
    await tx.document.update({ where: { id: document.id }, data: { status: "analyzed" } });
  });

  return NextResponse.json({ itemCount: toCreate.length });
}

function safeScalarOrName(fieldKey: string, valueJson: string): string {
  if (fieldKey === "feature" || fieldKey === "risk") {
    try {
      const parsed = JSON.parse(valueJson) as { name?: string; description?: string };
      return parsed.name ?? parsed.description ?? "";
    } catch {
      return "";
    }
  }
  return valueJson;
}

export const POST = withApi(POSTHandler);
