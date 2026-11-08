import { z } from "zod";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireCollaborationAction } from "@/lib/access/actionGuard";
import { jsonError, zodMessage } from "@/lib/api";
import { generalIntakeSchema, generalIntakeVersion } from "@/lib/planning/generalIntake";
import { saveGeneralIntake } from "@/lib/planning/saveGeneralIntake";

type Context = { params: Promise<{ id: string }> };
async function GETHandler(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return jsonError("Draft not found.", 404);
  const user = await requireCurrentUser();
  const draft = await db.initiative.findFirst({ where: { id, organizationId: user.organizationId }, include: { intakeAnswerSet: true } });
  if (!draft) return jsonError("Draft not found.", 404);
  await requireCollaborationAction(id, user.id, "edit", user.organizationId);
  return Response.json({ initiativeId: draft.id, updatedAt: generalIntakeVersion(draft), values: {
    name: draft.name, methodology: draft.methodology, problemStatement: draft.intakeAnswerSet?.problemStatement ?? "",
    targetCustomer: draft.intakeAnswerSet?.targetCustomer ?? "", outcomeStatement: draft.intakeAnswerSet?.outcomeStatement ?? "",
  } });
}
async function PUTHandler(request: Request, { params }: Context) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return jsonError("Invalid draft identifier.", 422);
  const user = await requireCurrentUser();
  const parsed = generalIntakeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  return Response.json(await saveGeneralIntake(user, id, parsed.data));
}
export const GET = withAuthenticatedApi(GETHandler);
export const PUT = withAuthenticatedApi(PUTHandler);
