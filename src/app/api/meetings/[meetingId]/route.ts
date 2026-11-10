import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";

const schema = z.object({
  notes: z.string().max(100000),
  transcriptText: z.string().max(200000),
  summary: z.string().max(10000),
  transcriptSource: z.enum(["provider", "imported", "manual"]).nullable(),
}).strict();

async function PATCHHandler(request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const meeting = await db.planningMeeting.findFirst({ where: { id: meetingId, organizationId: auth.user.organizationId } });
  if (!meeting) return jsonError("Meeting not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, meeting.initiativeId, "edit");
  if (!access.ok) return access.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  await db.planningMeeting.update({ where: { id: meetingId }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export const PATCH = withAuthenticatedApi(PATCHHandler);
