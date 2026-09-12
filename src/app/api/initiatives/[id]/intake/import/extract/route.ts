import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import {
  MAX_IMPORT_FILE_BYTES,
  SUPPORTED_IMPORT_EXTENSIONS,
  extractDocumentText,
  isSupportedImportExtension,
} from "@/lib/intakeImport/extractText";

// Step 1 of 2 for document import (see ../route.ts for step 2). Split into
// its own request purely so the client can show a real "reading your
// document" stage distinct from "extracting planning details" — two genuine
// network round trips, not a fabricated progress animation over one request.
// No AI call, no usage/budget check here: extraction alone doesn't touch the
// gateway.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireInitiativeApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) return jsonError("No file provided.", 422);

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return jsonError(`That file is too large — please keep it under ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)}MB.`, 422);
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!isSupportedImportExtension(ext)) {
    return jsonError(`Unsupported file type — upload a ${SUPPORTED_IMPORT_EXTENSIONS.map((e) => `.${e}`).join(", ")} file.`, 422);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  try {
    text = await extractDocumentText(buffer);
  } catch {
    return jsonError("Could not read that file — it may be corrupted or password-protected.", 422);
  }
  if (!text.trim()) {
    return jsonError("No readable text was found in that document.", 422);
  }

  return NextResponse.json({ text, sourceFileName: file.name });
}
