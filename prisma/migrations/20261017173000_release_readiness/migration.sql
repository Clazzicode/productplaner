CREATE TABLE "ReleaseReadinessAssessment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "initiativeId" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "releaseSnapshot" JSONB NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "stakeholderCommunication" TEXT NOT NULL DEFAULT '',
  "communicationOwnerStakeholderId" TEXT,
  "communicationOwnerNameSnapshot" TEXT NOT NULL DEFAULT '',
  "communicationStatus" TEXT NOT NULL DEFAULT 'not_started',
  "decisionReason" TEXT NOT NULL DEFAULT '',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "supersedesAssessmentId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReleaseReadinessAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReleaseReadinessCheck" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "checkKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "overrideReason" TEXT NOT NULL DEFAULT '',
  "overriddenByUserId" TEXT,
  "overriddenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReleaseReadinessCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReleaseReadinessRevision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "fromRevision" INTEGER NOT NULL,
  "toRevision" INTEGER NOT NULL,
  "previousData" JSONB NOT NULL,
  "nextData" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReleaseReadinessRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReleaseReadinessAiSuggestion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "stakeholderCommunication" TEXT NOT NULL,
  "informationUsed" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'proposed',
  "model" TEXT NOT NULL DEFAULT '',
  "generatedByUserId" TEXT NOT NULL,
  "actedByUserId" TEXT,
  "actedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReleaseReadinessAiSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReleaseReadinessAssessment_releaseId_sequence_key" ON "ReleaseReadinessAssessment"("releaseId", "sequence");
CREATE INDEX "ReleaseReadinessAssessment_organizationId_initiativeId_status_idx" ON "ReleaseReadinessAssessment"("organizationId", "initiativeId", "status");
CREATE INDEX "ReleaseReadinessAssessment_releaseId_createdAt_idx" ON "ReleaseReadinessAssessment"("releaseId", "createdAt");
CREATE UNIQUE INDEX "ReleaseReadinessCheck_assessmentId_checkKey_key" ON "ReleaseReadinessCheck"("assessmentId", "checkKey");
CREATE INDEX "ReleaseReadinessCheck_organizationId_assessmentId_idx" ON "ReleaseReadinessCheck"("organizationId", "assessmentId");
CREATE UNIQUE INDEX "ReleaseReadinessRevision_assessmentId_toRevision_key" ON "ReleaseReadinessRevision"("assessmentId", "toRevision");
CREATE INDEX "ReleaseReadinessRevision_organizationId_createdAt_idx" ON "ReleaseReadinessRevision"("organizationId", "createdAt");
CREATE UNIQUE INDEX "ReleaseReadinessAiSuggestion_assessmentId_fingerprint_key" ON "ReleaseReadinessAiSuggestion"("assessmentId", "fingerprint");
CREATE INDEX "ReleaseReadinessAiSuggestion_organizationId_createdAt_idx" ON "ReleaseReadinessAiSuggestion"("organizationId", "createdAt");
CREATE INDEX "ReleaseReadinessAiSuggestion_assessmentId_status_createdAt_idx" ON "ReleaseReadinessAiSuggestion"("assessmentId", "status", "createdAt");

ALTER TABLE "ReleaseReadinessAssessment"
  ADD CONSTRAINT "ReleaseReadinessAssessment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ReleaseReadinessAssessment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ReleaseReadinessAssessment_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ReleaseReadinessAssessment_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ReleaseReadinessAssessment_communicationOwnerStakeholderId_fkey" FOREIGN KEY ("communicationOwnerStakeholderId") REFERENCES "StakeholderContact"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "ReleaseReadinessAssessment_supersedesAssessmentId_fkey" FOREIGN KEY ("supersedesAssessmentId") REFERENCES "ReleaseReadinessAssessment"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ReleaseReadinessAssessment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ReleaseReadinessAssessment_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "ReleaseReadinessCheck"
  ADD CONSTRAINT "ReleaseReadinessCheck_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ReleaseReadinessCheck_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ReleaseReadinessAssessment"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ReleaseReadinessCheck_overriddenByUserId_fkey" FOREIGN KEY ("overriddenByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "ReleaseReadinessRevision"
  ADD CONSTRAINT "ReleaseReadinessRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ReleaseReadinessRevision_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ReleaseReadinessAssessment"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ReleaseReadinessRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "ReleaseReadinessAiSuggestion"
  ADD CONSTRAINT "ReleaseReadinessAiSuggestion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ReleaseReadinessAiSuggestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ReleaseReadinessAssessment"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ReleaseReadinessAiSuggestion_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ReleaseReadinessAiSuggestion_actedByUserId_fkey" FOREIGN KEY ("actedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;

ALTER TABLE "ReleaseReadinessAssessment"
  ADD CHECK ("sequence" > 0),
  ADD CHECK ("revision" > 0),
  ADD CHECK ("status" IN ('draft','needs_attention','ready','approved')),
  ADD CHECK ("communicationStatus" IN ('not_started','drafted','sent')),
  ADD CHECK (("communicationOwnerStakeholderId" IS NULL AND "communicationOwnerNameSnapshot" = '') OR ("communicationOwnerStakeholderId" IS NOT NULL AND char_length(btrim("communicationOwnerNameSnapshot")) > 0)),
  ADD CHECK ("status" <> 'approved' OR ("approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL AND char_length(btrim("decisionReason")) >= 3));
ALTER TABLE "ReleaseReadinessCheck"
  ADD CHECK ("status" IN ('pass','warning','fail','overridden')),
  ADD CHECK ("status" <> 'overridden' OR (char_length(btrim("overrideReason")) >= 5 AND "overriddenByUserId" IS NOT NULL AND "overriddenAt" IS NOT NULL));
ALTER TABLE "ReleaseReadinessRevision" ADD CHECK ("fromRevision" > 0 AND "toRevision" = "fromRevision" + 1), ADD CHECK (char_length(btrim("reason")) >= 3);
ALTER TABLE "ReleaseReadinessAiSuggestion" ADD CHECK ("status" IN ('proposed','used','dismissed','stale'));

CREATE FUNCTION validate_release_readiness_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_org TEXT; parent_project TEXT; parent_initiative TEXT; owner_org TEXT;
BEGIN
  SELECT i."organizationId", i."projectId", i.id INTO parent_org, parent_project, parent_initiative
  FROM "Release" r JOIN "Prototype" p ON p.id=r."prototypeId" JOIN "Initiative" i ON i.id=p."initiativeId" WHERE r.id=NEW."releaseId";
  IF parent_org IS NULL OR parent_org<>NEW."organizationId" OR parent_project<>NEW."projectId" OR parent_initiative<>NEW."initiativeId" THEN RAISE EXCEPTION 'Release readiness tenant mismatch'; END IF;
  IF NEW."communicationOwnerStakeholderId" IS NOT NULL THEN SELECT "organizationId" INTO owner_org FROM "StakeholderContact" WHERE id=NEW."communicationOwnerStakeholderId"; IF owner_org IS NULL OR owner_org<>NEW."organizationId" THEN RAISE EXCEPTION 'Release readiness owner tenant mismatch'; END IF; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER release_readiness_parent BEFORE INSERT OR UPDATE ON "ReleaseReadinessAssessment" FOR EACH ROW EXECUTE FUNCTION validate_release_readiness_parent();

CREATE FUNCTION validate_release_readiness_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_org TEXT; BEGIN SELECT "organizationId" INTO parent_org FROM "ReleaseReadinessAssessment" WHERE id=NEW."assessmentId"; IF parent_org IS NULL OR parent_org<>NEW."organizationId" THEN RAISE EXCEPTION 'Release readiness child tenant mismatch'; END IF; RETURN NEW; END $$;
CREATE TRIGGER release_readiness_check_parent BEFORE INSERT OR UPDATE ON "ReleaseReadinessCheck" FOR EACH ROW EXECUTE FUNCTION validate_release_readiness_child();
CREATE TRIGGER release_readiness_revision_parent BEFORE INSERT OR UPDATE ON "ReleaseReadinessRevision" FOR EACH ROW EXECUTE FUNCTION validate_release_readiness_child();
CREATE TRIGGER release_readiness_ai_parent BEFORE INSERT OR UPDATE ON "ReleaseReadinessAiSuggestion" FOR EACH ROW EXECUTE FUNCTION validate_release_readiness_child();

CREATE FUNCTION protect_approved_release_readiness() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status='approved' THEN RAISE EXCEPTION 'Approved release readiness is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER release_readiness_approved_immutable BEFORE UPDATE OR DELETE ON "ReleaseReadinessAssessment" FOR EACH ROW EXECUTE FUNCTION protect_approved_release_readiness();
CREATE FUNCTION protect_release_readiness_check() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parent_status TEXT; BEGIN SELECT status INTO parent_status FROM "ReleaseReadinessAssessment" WHERE id=OLD."assessmentId"; IF parent_status='approved' THEN RAISE EXCEPTION 'Approved release readiness checks are immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER release_readiness_check_immutable BEFORE UPDATE OR DELETE ON "ReleaseReadinessCheck" FOR EACH ROW EXECUTE FUNCTION protect_release_readiness_check();
CREATE TRIGGER release_readiness_revision_immutable BEFORE UPDATE OR DELETE ON "ReleaseReadinessRevision" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

ALTER TABLE "ReleaseReadinessAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReleaseReadinessCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReleaseReadinessRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReleaseReadinessAiSuggestion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ReleaseReadinessAssessment","ReleaseReadinessCheck","ReleaseReadinessRevision","ReleaseReadinessAiSuggestion" FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON "ReleaseReadinessAssessment","ReleaseReadinessCheck","ReleaseReadinessAiSuggestion" TO app_rw;
GRANT SELECT,INSERT ON "ReleaseReadinessRevision" TO app_rw;
CREATE POLICY release_readiness_all ON "ReleaseReadinessAssessment" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY release_readiness_check_all ON "ReleaseReadinessCheck" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY release_readiness_revision_select ON "ReleaseReadinessRevision" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY release_readiness_revision_insert ON "ReleaseReadinessRevision" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY release_readiness_ai_all ON "ReleaseReadinessAiSuggestion" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
