import { NextResponse } from "next/server";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireCollaborationAction } from "@/lib/access/actionGuard";
import { db } from "@/lib/db";
import { createRegenerationProposal } from "@/lib/generation/proposals";

async function GETHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();
  await requireCollaborationAction(id, user.id, "edit");
  return NextResponse.json({ proposals: await db.regenerationProposal.findMany({ where: { initiativeId: id }, orderBy: { createdAt: "desc" }, take: 20 }) });
}
async function POSTHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await createRegenerationProposal(id), { status: 201 });
}
export const GET = withAuthenticatedApi(GETHandler);
export const POST = withAuthenticatedApi(POSTHandler);
