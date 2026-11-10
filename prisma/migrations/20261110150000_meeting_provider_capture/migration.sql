-- Preserve the invitation roster separately from observed provider attendance.
-- Existing PlanningMeeting RLS continues to guard the new columns.
ALTER TABLE public."PlanningMeeting"
  ADD COLUMN "scheduledEndAt" TIMESTAMP(3),
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "joinUrl" TEXT,
  ADD COLUMN "providerMeetingId" TEXT,
  ADD COLUMN "calendarEventId" TEXT,
  ADD COLUMN "actualStartedAt" TIMESTAMP(3),
  ADD COLUMN "actualEndedAt" TIMESTAMP(3),
  ADD COLUMN "summary" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "transcriptSource" TEXT;
ALTER TABLE public."PlanningMeeting"
  ADD CONSTRAINT "PlanningMeeting_provider_check" CHECK ("provider" IS NULL OR "provider" IN ('google_meet', 'zoom')),
  ADD CONSTRAINT "PlanningMeeting_transcriptSource_check" CHECK ("transcriptSource" IS NULL OR "transcriptSource" IN ('provider', 'imported', 'manual'));
ALTER TABLE public."PlanningMeeting" DROP CONSTRAINT "PlanningMeeting_type_check";
ALTER TABLE public."PlanningMeeting" ADD CONSTRAINT "PlanningMeeting_type_check"
  CHECK ("meetingType" IN ('refinement','sprint_planning','sprint_review','stakeholder_review','release_readiness','demo'));
ALTER TABLE public."PlanningMeeting" DROP CONSTRAINT "PlanningMeeting_status_check";
ALTER TABLE public."PlanningMeeting" ADD CONSTRAINT "PlanningMeeting_status_check"
  CHECK (status IN ('draft','in_progress','finalized','cancelled','scheduled','completed'));
CREATE INDEX "PlanningMeeting_organizationId_providerMeetingId_idx"
  ON public."PlanningMeeting"("organizationId", "provider", "providerMeetingId");

ALTER TABLE public."PlanningMeetingParticipant"
  ADD COLUMN "attendanceStatus" TEXT NOT NULL DEFAULT 'invited',
  ADD COLUMN "providerDisplayName" TEXT,
  ADD COLUMN "providerParticipantId" TEXT,
  ADD COLUMN "joinedAt" TIMESTAMP(3),
  ADD COLUMN "leftAt" TIMESTAMP(3);
ALTER TABLE public."PlanningMeetingParticipant"
  ADD CONSTRAINT "PlanningMeetingParticipant_attendanceStatus_check"
  CHECK ("attendanceStatus" IN ('invited', 'joined', 'absent', 'unmatched'));
CREATE UNIQUE INDEX "PlanningMeetingParticipant_meetingId_providerParticipantId_key"
  ON public."PlanningMeetingParticipant"("meetingId", "providerParticipantId");
