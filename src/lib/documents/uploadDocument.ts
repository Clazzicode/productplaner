import { db } from "@/lib/db";
import {
  isSupportedImportExtension,
  MAX_IMPORT_FILE_BYTES,
  SUPPORTED_IMPORT_EXTENSIONS,
} from "./constants";

// Document Import & Approved Context (directive §3/§6). Shared create logic
// for both POST /api/projects/[id]/documents and
// POST /api/initiatives/[id]/documents — same size/extension validation the
// prior single-document import route already did, now persisting the file
// itself (directive item 20) instead of discarding it after one request.

export type CreateDocumentResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string; status: number };

export async function createDocument(params: {
  organizationId: string;
  projectId: string;
  initiativeId: string | null;
  scope: "project_shared" | "initiative_only";
  uploadedByUserId: string;
  file: File;
}): Promise<CreateDocumentResult> {
  const { file } = params;

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return {
      ok: false,
      error: `That file is too large — the limit is ${Math.round(MAX_IMPORT_FILE_BYTES / 1024 / 1024)}MB.`,
      status: 413,
    };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!isSupportedImportExtension(ext)) {
    return {
      ok: false,
      error: `Unsupported file type — supported: ${SUPPORTED_IMPORT_EXTENSIONS.join(", ").toUpperCase()}.`,
      status: 422,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const document = await db.document.create({
    data: {
      organizationId: params.organizationId,
      projectId: params.projectId,
      initiativeId: params.initiativeId,
      scope: params.scope,
      uploadedByUserId: params.uploadedByUserId,
      fileName: file.name,
      fileExt: ext,
      fileSizeBytes: file.size,
      fileBytes: buffer,
      status: "uploaded",
    },
    select: { id: true },
  });

  return { ok: true, documentId: document.id };
}
