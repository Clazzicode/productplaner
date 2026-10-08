ALTER TABLE "PlanningRequest" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "ArtifactLayer" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "ArtifactLayer" ADD COLUMN "backlogRevision" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "ArtifactLayer_prototypeId_archivedAt_idx"
  ON "ArtifactLayer"("prototypeId", "archivedAt");

ALTER TABLE "ArtifactLayer"
  ADD CONSTRAINT "ArtifactLayer_backlogRevision_positive"
  CHECK ("backlogRevision" > 0);
