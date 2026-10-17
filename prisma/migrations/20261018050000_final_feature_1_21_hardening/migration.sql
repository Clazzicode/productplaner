CREATE TABLE "ReleaseReadinessFollowUp" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "checkKey" TEXT NOT NULL,
  "planningRequestId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReleaseReadinessFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReleaseReadinessFollowUp_planningRequestId_key" ON "ReleaseReadinessFollowUp"("planningRequestId");
CREATE UNIQUE INDEX "ReleaseReadinessFollowUp_assessmentId_checkKey_key" ON "ReleaseReadinessFollowUp"("assessmentId", "checkKey");
CREATE INDEX "ReleaseReadinessFollowUp_organizationId_createdAt_idx" ON "ReleaseReadinessFollowUp"("organizationId", "createdAt");

ALTER TABLE "ReleaseReadinessFollowUp"
  ADD CONSTRAINT "ReleaseReadinessFollowUp_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ReleaseReadinessAssessment"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ReleaseReadinessFollowUp_planningRequestId_fkey" FOREIGN KEY ("planningRequestId") REFERENCES "PlanningRequest"("id") ON DELETE RESTRICT;

CREATE FUNCTION validate_release_readiness_follow_up_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  assessment_org TEXT;
  assessment_initiative TEXT;
  request_initiative TEXT;
BEGIN
  SELECT "organizationId", "initiativeId" INTO assessment_org, assessment_initiative
  FROM "ReleaseReadinessAssessment" WHERE id = NEW."assessmentId";
  SELECT "initiativeId" INTO request_initiative
  FROM "PlanningRequest" WHERE id = NEW."planningRequestId";
  IF assessment_org IS NULL OR request_initiative IS NULL OR assessment_org <> NEW."organizationId" OR assessment_initiative <> request_initiative THEN
    RAISE EXCEPTION 'Release readiness follow-up tenant mismatch';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER release_readiness_follow_up_tenant
BEFORE INSERT OR UPDATE ON "ReleaseReadinessFollowUp"
FOR EACH ROW EXECUTE FUNCTION validate_release_readiness_follow_up_tenant();

ALTER TABLE "ReleaseReadinessFollowUp" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ReleaseReadinessFollowUp" FROM anon, authenticated;
GRANT SELECT, INSERT ON "ReleaseReadinessFollowUp" TO app_rw;
CREATE POLICY release_readiness_follow_up_select ON "ReleaseReadinessFollowUp"
  FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY release_readiness_follow_up_insert ON "ReleaseReadinessFollowUp"
  FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
