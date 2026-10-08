import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";
import {
  listAcceptanceCriterionHistory,
  updateAcceptanceCriterion,
} from "@/lib/stories/service";
import { acceptanceCriterionUpdateSchema } from "@/lib/validation/schemas";

async function authorize(id: string) {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return { ok: false as const, response: auth.response };
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, "edit");
  if (!access.ok) return { ok: false as const, response: access.response };
  return { ok: true as const, user: auth.user };
}

async function GETHandler(
  _request: Request,
  { params }: { params: Promise<{ id: string; criterionId: string }> },
) {
  const { id, criterionId } = await params;
  const auth = await authorize(id);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({
      history: await listAcceptanceCriterionHistory(id, criterionId),
    });
  } catch (error) {
    if (error instanceof BusinessError) return jsonError(error.message, error.status);
    throw error;
  }
}

async function PATCHHandler(
  request: Request,
  { params }: { params: Promise<{ id: string; criterionId: string }> },
) {
  const { id, criterionId } = await params;
  const auth = await authorize(id);
  if (!auth.ok) return auth.response;
  const parsed = acceptanceCriterionUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try {
    return NextResponse.json({
      criterion: await updateAcceptanceCriterion(
        id,
        criterionId,
        parsed.data,
        auth.user.id,
      ),
    });
  } catch (error) {
    if (error instanceof BusinessError) return jsonError(error.message, error.status);
    throw error;
  }
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
