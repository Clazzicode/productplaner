CREATE TABLE "FeedbackRecord" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"projectId" TEXT NOT NULL,"initiativeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,"details" TEXT NOT NULL,"source" TEXT NOT NULL,"sourceReference" TEXT,"category" TEXT NOT NULL DEFAULT 'general',
  "status" TEXT NOT NULL DEFAULT 'captured',"summary" TEXT NOT NULL DEFAULT '',"dedupeKey" TEXT NOT NULL,
  "linkedEntityType" TEXT,"linkedEntityId" TEXT,"revision" INTEGER NOT NULL DEFAULT 1,"createdByUserId" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedbackRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FeedbackRevision" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"feedbackId" TEXT NOT NULL,"fromRevision" INTEGER NOT NULL,"toRevision" INTEGER NOT NULL,
  "previousData" JSONB NOT NULL,"nextData" JSONB NOT NULL,"reason" TEXT NOT NULL,"actorUserId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackRevision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FeedbackFollowUp" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"feedbackId" TEXT NOT NULL,"planningRequestId" TEXT NOT NULL,"createdByUserId" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackFollowUp_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReprioritizationProposal" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"feedbackId" TEXT NOT NULL,"entityType" TEXT NOT NULL,"entityId" TEXT NOT NULL,
  "expectedEntityRevision" INTEGER NOT NULL,"currentPrioritySnapshot" JSONB NOT NULL,"proposedFactors" JSONB NOT NULL,"moscow" TEXT NOT NULL,"roadmapLane" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,"source" TEXT NOT NULL DEFAULT 'manual',"status" TEXT NOT NULL DEFAULT 'proposed',"decisionReason" TEXT NOT NULL DEFAULT '',
  "appliedPriorityDecisionId" TEXT,"revision" INTEGER NOT NULL DEFAULT 1,"createdByUserId" TEXT NOT NULL,"decidedByUserId" TEXT,"decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReprioritizationProposal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FeedbackAiSuggestion" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"feedbackId" TEXT NOT NULL,"kind" TEXT NOT NULL,"fingerprint" TEXT NOT NULL,"content" JSONB NOT NULL,
  "informationUsed" TEXT NOT NULL DEFAULT '',"status" TEXT NOT NULL DEFAULT 'proposed',"model" TEXT NOT NULL DEFAULT '',"generatedByUserId" TEXT NOT NULL,
  "actedByUserId" TEXT,"actedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackAiSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeedbackRecord_initiativeId_dedupeKey_key" ON "FeedbackRecord"("initiativeId","dedupeKey");
CREATE INDEX "FeedbackRecord_organizationId_initiativeId_status_idx" ON "FeedbackRecord"("organizationId","initiativeId","status");
CREATE INDEX "FeedbackRecord_initiativeId_linkedEntityType_linkedEntityId_idx" ON "FeedbackRecord"("initiativeId","linkedEntityType","linkedEntityId");
CREATE UNIQUE INDEX "FeedbackRevision_feedbackId_toRevision_key" ON "FeedbackRevision"("feedbackId","toRevision");
CREATE INDEX "FeedbackRevision_organizationId_createdAt_idx" ON "FeedbackRevision"("organizationId","createdAt");
CREATE UNIQUE INDEX "FeedbackFollowUp_planningRequestId_key" ON "FeedbackFollowUp"("planningRequestId");
CREATE INDEX "FeedbackFollowUp_organizationId_feedbackId_idx" ON "FeedbackFollowUp"("organizationId","feedbackId");
CREATE INDEX "ReprioritizationProposal_organizationId_feedbackId_status_idx" ON "ReprioritizationProposal"("organizationId","feedbackId","status");
CREATE INDEX "ReprioritizationProposal_entityType_entityId_createdAt_idx" ON "ReprioritizationProposal"("entityType","entityId","createdAt");
CREATE UNIQUE INDEX "FeedbackAiSuggestion_feedbackId_kind_fingerprint_key" ON "FeedbackAiSuggestion"("feedbackId","kind","fingerprint");
CREATE INDEX "FeedbackAiSuggestion_organizationId_createdAt_idx" ON "FeedbackAiSuggestion"("organizationId","createdAt");
CREATE INDEX "FeedbackAiSuggestion_feedbackId_status_createdAt_idx" ON "FeedbackAiSuggestion"("feedbackId","status","createdAt");

ALTER TABLE "FeedbackRecord"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "FeedbackRevision"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("feedbackId") REFERENCES "FeedbackRecord"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "FeedbackFollowUp"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("feedbackId") REFERENCES "FeedbackRecord"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("planningRequestId") REFERENCES "PlanningRequest"("id") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ReprioritizationProposal"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("feedbackId") REFERENCES "FeedbackRecord"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("appliedPriorityDecisionId") REFERENCES "PriorityDecision"("id") ON DELETE SET NULL,
  ADD FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "FeedbackAiSuggestion"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("feedbackId") REFERENCES "FeedbackRecord"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("actedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;

ALTER TABLE "FeedbackRecord"
  ADD CHECK ("source" IN ('customer','stakeholder','demo','sprint_review','release','meeting','support','jira','manual')),
  ADD CHECK ("category" IN ('general','request','quality','usability','scope','delivery','risk')),
  ADD CHECK ("status" IN ('captured','triaged','actioned','closed')),
  ADD CHECK ("linkedEntityType" IS NULL OR "linkedEntityType" IN ('request','feature','story','bug','sprint','release','meeting','demo','validation')),
  ADD CHECK (("linkedEntityType" IS NULL)=("linkedEntityId" IS NULL)),ADD CHECK ("revision">0),ADD CHECK (char_length("dedupeKey")=64);
ALTER TABLE "FeedbackRevision" ADD CHECK ("fromRevision">=0 AND "toRevision"="fromRevision"+1),ADD CHECK (char_length(btrim(reason))>=3);
ALTER TABLE "ReprioritizationProposal"
  ADD CHECK ("entityType" IN ('request','feature','story')),ADD CHECK ("expectedEntityRevision">0),ADD CHECK ("revision">0),
  ADD CHECK ("moscow" IN ('must','should','could','wont_now')),ADD CHECK ("roadmapLane" IN ('now','next','later','unscheduled')),
  ADD CHECK ("source" IN ('manual','ai')),ADD CHECK ("status" IN ('proposed','applied','dismissed')),
  ADD CHECK ("status"='proposed' OR ("decidedByUserId" IS NOT NULL AND "decidedAt" IS NOT NULL AND char_length(btrim("decisionReason"))>=3)),
  ADD CHECK ("status"<>'applied' OR "appliedPriorityDecisionId" IS NOT NULL);
ALTER TABLE "FeedbackAiSuggestion" ADD CHECK (kind IN ('summary','reprioritization')),ADD CHECK (status IN ('proposed','used','dismissed','stale')),ADD CHECK (char_length(fingerprint)=64);

CREATE FUNCTION validate_feedback_parent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE org_id TEXT; project_id TEXT; BEGIN SELECT "organizationId","projectId" INTO org_id,project_id FROM "Initiative" WHERE id=NEW."initiativeId"; IF org_id IS NULL OR org_id<>NEW."organizationId" OR project_id<>NEW."projectId" THEN RAISE EXCEPTION 'Feedback tenant mismatch'; END IF; RETURN NEW; END $$;
CREATE TRIGGER feedback_parent BEFORE INSERT OR UPDATE ON "FeedbackRecord" FOR EACH ROW EXECUTE FUNCTION validate_feedback_parent();
CREATE FUNCTION validate_feedback_child() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE org_id TEXT; BEGIN SELECT "organizationId" INTO org_id FROM "FeedbackRecord" WHERE id=NEW."feedbackId"; IF org_id IS NULL OR org_id<>NEW."organizationId" THEN RAISE EXCEPTION 'Feedback child tenant mismatch'; END IF; RETURN NEW; END $$;
CREATE TRIGGER feedback_revision_parent BEFORE INSERT OR UPDATE ON "FeedbackRevision" FOR EACH ROW EXECUTE FUNCTION validate_feedback_child();
CREATE TRIGGER feedback_followup_parent BEFORE INSERT OR UPDATE ON "FeedbackFollowUp" FOR EACH ROW EXECUTE FUNCTION validate_feedback_child();
CREATE TRIGGER feedback_proposal_parent BEFORE INSERT OR UPDATE ON "ReprioritizationProposal" FOR EACH ROW EXECUTE FUNCTION validate_feedback_child();
CREATE TRIGGER feedback_ai_parent BEFORE INSERT OR UPDATE ON "FeedbackAiSuggestion" FOR EACH ROW EXECUTE FUNCTION validate_feedback_child();
CREATE FUNCTION protect_feedback_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Feedback revision is immutable'; END $$;
CREATE TRIGGER feedback_revision_immutable BEFORE UPDATE OR DELETE ON "FeedbackRevision" FOR EACH ROW EXECUTE FUNCTION protect_feedback_revision();
CREATE FUNCTION protect_decided_reprioritization() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status<>'proposed' THEN RAISE EXCEPTION 'Decided reprioritization is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER reprioritization_decision_immutable BEFORE UPDATE OR DELETE ON "ReprioritizationProposal" FOR EACH ROW EXECUTE FUNCTION protect_decided_reprioritization();

ALTER TABLE "FeedbackRecord" ENABLE ROW LEVEL SECURITY;ALTER TABLE "FeedbackRevision" ENABLE ROW LEVEL SECURITY;ALTER TABLE "FeedbackFollowUp" ENABLE ROW LEVEL SECURITY;ALTER TABLE "ReprioritizationProposal" ENABLE ROW LEVEL SECURITY;ALTER TABLE "FeedbackAiSuggestion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "FeedbackRecord","FeedbackRevision","FeedbackFollowUp","ReprioritizationProposal","FeedbackAiSuggestion" FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON "FeedbackRecord","ReprioritizationProposal","FeedbackAiSuggestion" TO app_rw;GRANT SELECT,INSERT ON "FeedbackRevision","FeedbackFollowUp" TO app_rw;
CREATE POLICY feedback_all ON "FeedbackRecord" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY feedback_revision_select ON "FeedbackRevision" FOR SELECT TO app_rw USING (is_org_member("organizationId"));CREATE POLICY feedback_revision_insert ON "FeedbackRevision" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY feedback_followup_select ON "FeedbackFollowUp" FOR SELECT TO app_rw USING (is_org_member("organizationId"));CREATE POLICY feedback_followup_insert ON "FeedbackFollowUp" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY reprioritization_all ON "ReprioritizationProposal" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY feedback_ai_all ON "FeedbackAiSuggestion" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
