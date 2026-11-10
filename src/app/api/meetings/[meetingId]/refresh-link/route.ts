import { NextResponse } from "next/server";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { resolveMeetLink } from "@/lib/meetings/schedule";

export const runtime = "nodejs";

async function POSTHandler(_request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const meeting = await db.planningMeeting.findFirst({ where: { id: meetingId, organizationId: auth.user.organizationId, provider: "google_meet" } });
  if (!meeting || !meeting.calendarEventId) return jsonError("Google Meet event not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, meeting.initiativeId, "edit");
  if (!access.ok) return access.response;
  if (meeting.createdByUserId !== auth.user.id) return jsonError("Only the meeting organizer can refresh this link.", 403);
  try {
    const joinUrl = await resolveMeetLink(auth.user.organizationId, auth.user.id, meeting.calendarEventId);
    if (!joinUrl) return NextResponse.json({ pending: true });
    await db.planningMeeting.update({ where: { id: meeting.id }, data: { joinUrl } });
    return NextResponse.json({ joinUrl });
  } catch {
    return jsonError("Could not refresh the Meet link.", 502);
  }
}

export const POST = withAuthenticatedApi(POSTHandler);
