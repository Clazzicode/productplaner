import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireCollaborationAction } from "@/lib/access/actionGuard";
import { db } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { applyRegenerationProposal } from "@/lib/generation/proposals";

type Context = { params: Promise<{ id: string; proposalId: string }> };
const application = z.object({ expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  decisions: z.array(z.object({ key: z.string().min(1), action: z.enum(["keep", "apply", "map"]), targetId: z.string().optional() }).strict()).max(10000) }).strict();
async function GETHandler(_request: Request, { params }: Context) {
  const { id, proposalId } = await params;
  const user = await requireCurrentUser();
  await requireCollaborationAction(id, user.id, "edit");
  const proposal = await db.regenerationProposal.findFirst({ where: { id: proposalId, initiativeId: id } });
  return proposal ? NextResponse.json({ proposal }) : jsonError("Proposal not found.", 404);
}
async function POSTHandler(request: Request, { params }: Context) {
  const { id, proposalId } = await params;
  const parsed = application.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  return NextResponse.json(await applyRegenerationProposal(id, proposalId, parsed.data.expectedFingerprint, parsed.data.decisions));
}
export const GET = withAuthenticatedApi(GETHandler);
export const POST = withAuthenticatedApi(POSTHandler);
