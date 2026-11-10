import { NextResponse } from "next/server";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { syncAttendance } from "@/lib/meetings/attendance";

export const runtime = "nodejs";

async function POSTHandler(_request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const meeting = await db.planningMeeting.findFirst({ where: { id: meetingId, organizationId: auth.user.organizationId } });
  if (!meeting) return jsonError("Meeting not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, meeting.initiativeId, "edit");
  if (!access.ok) return access.response;
  if (meeting.createdByUserId !== auth.user.id) return jsonError("Only the meeting organizer can sync provider activity.", 403);
  try {
    return NextResponse.json(await syncAttendance(meeting));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not sync attendance.", 502);
  }
}

export const POST = withAuthenticatedApi(POSTHandler);
