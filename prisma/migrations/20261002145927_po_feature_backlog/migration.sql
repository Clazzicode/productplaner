-- Additive PO feature-backlog metadata on the existing Capability record.
ALTER TABLE "Capability"
  ADD COLUMN "backlogLane" TEXT NOT NULL DEFAULT 'unscheduled',
  ADD COLUMN "backlogStatus" TEXT NOT NULL DEFAULT 'planned',
  ADD COLUMN "backlogRevision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "backlogKey" TEXT;

ALTER TABLE "Capability"
  ADD CONSTRAINT "Capability_backlogLane_check" CHECK ("backlogLane" IN ('now','next','later','unscheduled')),
  ADD CONSTRAINT "Capability_backlogStatus_check" CHECK ("backlogStatus" IN ('planned','in_progress','ready_for_review','done','archived')),
  ADD CONSTRAINT "Capability_backlogRevision_check" CHECK ("backlogRevision" > 0);

CREATE UNIQUE INDEX "Capability_intakeAnswerSetId_backlogKey_key"
  ON "Capability"("intakeAnswerSetId", "backlogKey");
