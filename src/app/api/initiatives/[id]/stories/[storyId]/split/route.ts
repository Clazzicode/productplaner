import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { storySplitSchema } from "@/lib/validation/schemas";
import { splitStory } from "@/lib/stories/service";

async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string; storyId: string }> }) {
  const { id, storyId } = await params;
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, "edit"); if (!access.ok) return access.response;
  const parsed = storySplitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  return NextResponse.json({ stories: await splitStory(id, storyId, parsed.data, auth.user.id) }, { status: 201 });
}
export const POST = withApi(POSTHandler);
