import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { analyzeIntakeDocument } from "@/lib/intakeImport/analyzeDocument";
import {
  MAX_IMPORT_FILE_BYTES,
  SUPPORTED_IMPORT_EXTENSIONS,
  extractDocumentText,
  isSupportedImportExtension,
} from "@/lib/intakeImport/extractText";
import { decryptSecret } from "@/lib/security/secretBox";

// Analysis only — this route never writes to the database. The extracted draft
// goes back to the client for review; accepted fields are saved through the
// same PATCH /intake and POST /capabilities endpoints manual entry already uses.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const guard = await requireInitiativeApiAccess(user.id, id, "edit");
  if (!guard.ok) return guard.response;

  // Every user brings their own key (Settings → Anthropic API key) — there is
  // no shared/server-wide fallback, so this call only ever uses the requesting
  // account's own key.
  if (!user.anthropicApiKeyEncrypted) {
    return jsonError("Add your Anthropic API key in Settings to use document import.", 422);
  }
  let apiKey: string;
  try {
    apiKey = decryptSecret(user.anthropicApiKeyEncrypted);
  } catch {
    return jsonError("Your saved API key could not be read — please re-enter it in Settings.", 422);
  }

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

  try {
    const draft = await analyzeIntakeDocument(text, apiKey);
    return NextResponse.json({ draft, sourceFileName: file.name });
  } catch {
    return jsonError("Could not analyze that document — please try again.", 502);
  }
}
