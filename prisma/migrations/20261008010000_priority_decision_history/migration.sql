CREATE TABLE "PriorityDecision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "initiativeId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "score" INTEGER NOT NULL,
  "dependencyAdjustedScore" INTEGER NOT NULL,
  "moscow" TEXT NOT NULL,
  "roadmapLane" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "factors" JSONB NOT NULL,
  "changedByUserId" TEXT NOT NULL,
  "recommendationItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriorityDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PriorityDecision_entity_type_check" CHECK ("entityType" IN ('request','feature','story')),
  CONSTRAINT "PriorityDecision_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "PriorityDecision_score_check" CHECK ("score" BETWEEN 0 AND 100),
  CONSTRAINT "PriorityDecision_dependency_score_check" CHECK ("dependencyAdjustedScore" BETWEEN 0 AND 120),
  CONSTRAINT "PriorityDecision_moscow_check" CHECK ("moscow" IN ('must','should','could','wont_now')),
  CONSTRAINT "PriorityDecision_lane_check" CHECK ("roadmapLane" IN ('now','next','later','unscheduled')),
  CONSTRAINT "PriorityDecision_source_check" CHECK ("source" IN ('manual','ai')),
  CONSTRAINT "PriorityDecision_reason_check" CHECK (char_length(btrim("reason")) >= 3)
);

CREATE UNIQUE INDEX "PriorityDecision_entityType_entityId_revision_key"
  ON "PriorityDecision"("entityType", "entityId", "revision");
CREATE INDEX "PriorityDecision_initiativeId_createdAt_idx"
  ON "PriorityDecision"("initiativeId", "createdAt");
CREATE INDEX "PriorityDecision_organizationId_createdAt_idx"
  ON "PriorityDecision"("organizationId", "createdAt");
CREATE INDEX "PriorityDecision_entityType_entityId_createdAt_idx"
  ON "PriorityDecision"("entityType", "entityId", "createdAt");
CREATE INDEX "PriorityDecision_changedByUserId_idx"
  ON "PriorityDecision"("changedByUserId");

ALTER TABLE "PriorityDecision" ADD CONSTRAINT "PriorityDecision_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriorityDecision" ADD CONSTRAINT "PriorityDecision_initiativeId_fkey"
  FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriorityDecision" ADD CONSTRAINT "PriorityDecision_changedByUserId_fkey"
  FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_priority_decision_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  actor_auth_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Initiative" i
    WHERE i.id = NEW."initiativeId" AND i."organizationId" = NEW."organizationId"
  ) THEN RAISE EXCEPTION 'Priority decision tenant parent mismatch'; END IF;

  IF NEW."entityType" = 'request' AND NOT EXISTS (
    SELECT 1 FROM "PlanningRequest" r WHERE r.id = NEW."entityId" AND r."initiativeId" = NEW."initiativeId"
  ) THEN RAISE EXCEPTION 'Priority request parent mismatch';
  ELSIF NEW."entityType" = 'feature' AND NOT EXISTS (
    SELECT 1 FROM "Capability" c JOIN "IntakeAnswerSet" a ON a.id = c."intakeAnswerSetId"
    WHERE c.id = NEW."entityId" AND a."initiativeId" = NEW."initiativeId"
  ) THEN RAISE EXCEPTION 'Priority feature parent mismatch';
  ELSIF NEW."entityType" = 'story' AND NOT EXISTS (
    SELECT 1 FROM "ArtifactLayer" s JOIN "Prototype" p ON p.id = s."prototypeId"
    WHERE s.id = NEW."entityId" AND s.type = 'story' AND p."initiativeId" = NEW."initiativeId"
  ) THEN RAISE EXCEPTION 'Priority story parent mismatch';
  END IF;

  SELECT "authUserId" INTO actor_auth_id FROM "User"
    WHERE id = NEW."changedByUserId" AND status = 'active';
  IF actor_auth_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM "OrganizationMember" m
    WHERE m."organizationId" = NEW."organizationId" AND m."authUserId" = actor_auth_id
      AND m.status = 'active' AND m.role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'Priority decisions require an active owner or admin'; END IF;

  IF NEW.source = 'ai' AND (
    NEW."recommendationItemId" IS NULL OR NOT EXISTS (
      SELECT 1 FROM "AiAssistItem" a
      WHERE a.id = NEW."recommendationItemId" AND a."organizationId" = NEW."organizationId"
        AND a."initiativeId" = NEW."initiativeId" AND a."actionKey" = 'RECOMMEND_PRIORITY'
        AND a.status IN ('proposed','stale')
    )
  ) THEN RAISE EXCEPTION 'AI priority source mismatch'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER priority_decision_parent BEFORE INSERT ON "PriorityDecision"
FOR EACH ROW EXECUTE FUNCTION validate_priority_decision_parent();

ALTER TABLE "PriorityDecision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PriorityDecision" FROM anon, authenticated;
GRANT SELECT, INSERT ON "PriorityDecision" TO app_rw;
CREATE POLICY priority_decision_select ON "PriorityDecision" FOR SELECT TO app_rw
  USING (is_org_member("organizationId"));
CREATE POLICY priority_decision_insert ON "PriorityDecision" FOR INSERT TO app_rw
  WITH CHECK (is_org_admin("organizationId"));
