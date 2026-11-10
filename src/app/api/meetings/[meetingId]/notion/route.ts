import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { importNotionPage } from "@/lib/notes/notion";

export const runtime = "nodejs";

async function POSTHandler(request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const meeting = await db.planningMeeting.findFirst({ where: { id: meetingId, organizationId: auth.user.organizationId } });
  if (!meeting) return jsonError("Meeting not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, meeting.initiativeId, "edit");
  if (!access.ok) return access.response;
  const parsed = z.object({ page: z.string().trim().min(1).max(2048) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return NextResponse.json(await importNotionPage(auth.user.organizationId, auth.user.id, parsed.data.page)); }
  catch (error) { return jsonError(error instanceof Error ? error.message : "Notion import failed.", 502); }
}

export const POST = withAuthenticatedApi(POSTHandler);
