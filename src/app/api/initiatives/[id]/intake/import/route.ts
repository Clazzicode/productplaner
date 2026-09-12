import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { runDocumentUnderstanding } from "@/lib/ai/actions/documentUnderstanding";
import {
  AiCapabilityDisabledError,
  AiDisabledError,
  AiRequestInProgressError,
  AiUsageLimitExceededError,
} from "@/lib/ai/errors";
import { documentUnderstandingRequestSchema } from "@/lib/validation/schemas";

// Step 2 of 2 for document import (see ./extract/route.ts for step 1, which
// reads the file and returns its text). This route never writes to the
// database — the extracted draft goes back to the client for review; accepted
// fields are saved through the same PATCH /intake and POST /capabilities
// endpoints manual entry already uses.
//
// Routes through the shared platform AI gateway (DOCUMENT_UNDERSTANDING) —
// no per-user API key anymore (directive §30/§37: bring-your-own-key removed).
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

  const parsed = documentUnderstandingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const { text, sourceFileName } = parsed.data;

  try {
    const draft = await runDocumentUnderstanding({
      documentText: text,
      initiativeId: id,
      userId: user.id,
      organizationId: user.organizationId,
    });
    return NextResponse.json({ draft, sourceFileName });
  } catch (err) {
    if (err instanceof AiDisabledError) return jsonError("AI features are currently disabled.", 503);
    if (err instanceof AiCapabilityDisabledError) return jsonError(err.message, 403);
    if (err instanceof AiUsageLimitExceededError) return jsonError(err.message, 429);
    if (err instanceof AiRequestInProgressError) {
      return jsonError("An import is already processing for this initiative.", 409);
    }
    return jsonError("Could not analyze that document — please try again.", 502);
  }
}
