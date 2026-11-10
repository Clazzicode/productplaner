import { NextResponse } from "next/server";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { cancelScheduledMeeting, meetingInputSchema, scheduleProviderMeeting } from "@/lib/meetings/schedule";

export const runtime = "nodejs";

async function POSTHandler(request: Request, { params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, initiativeId, "edit");
  if (!access.ok) return access.response;
  const parsed = meetingInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const input = parsed.data;
  const demo = await db.demoItem.findFirst({ where: { id: input.demoId, initiativeId, organizationId: auth.user.organizationId }, select: { id: true, sprintId: true } });
  const initiative = await db.initiative.findFirst({ where: { id: initiativeId, organizationId: auth.user.organizationId }, select: { projectId: true } });
  if (!demo || !initiative) return jsonError("Demo not found.", 404);
  try {
    const scheduled = await scheduleProviderMeeting(auth.user.organizationId, auth.user.id, input);
    const meeting = await withTransaction(async (tx) => {
      const created = await tx.planningMeeting.create({ data: {
        organizationId: auth.user.organizationId, projectId: initiative.projectId, initiativeId,
        meetingType: "demo", sprintId: demo.sprintId, title: input.title, purpose: input.purpose,
        provider: input.provider, scheduledAt: new Date(input.startsAt), scheduledEndAt: new Date(input.endsAt),
        joinUrl: scheduled.joinUrl, providerMeetingId: scheduled.providerMeetingId, calendarEventId: scheduled.calendarEventId,
        status: "scheduled", createdByUserId: auth.user.id,
      } });
      await tx.planningMeetingWorkItem.create({ data: { organizationId: auth.user.organizationId, meetingId: created.id, demoItemId: demo.id } });
      if (input.attendees.length) await tx.planningMeetingParticipant.createMany({ data: input.attendees.map((person) => ({
        organizationId: auth.user.organizationId, meetingId: created.id, participantNameSnapshot: person.name,
        participantEmailSnapshot: person.email, attendanceStatus: "invited",
      })) });
      return created;
    }).catch(async (error: unknown) => {
      await cancelScheduledMeeting(auth.user.organizationId, auth.user.id, scheduled);
      throw error;
    });
    return NextResponse.json({ meetingId: meeting.id, joinUrl: meeting.joinUrl, calendarEventId: meeting.calendarEventId });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not schedule the meeting.", 502);
  }
}

export const POST = withAuthenticatedApi(POSTHandler);
