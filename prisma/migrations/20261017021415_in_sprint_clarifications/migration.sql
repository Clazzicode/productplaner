-- Feature 14: durable, tenant-scoped in-sprint clarification workflow.
CREATE TABLE "InSprintClarification" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "initiativeId" TEXT NOT NULL,
  "sprintId" TEXT NOT NULL,
  "storyId" TEXT,
  "bugId" TEXT,
  "question" TEXT NOT NULL,
  "context" TEXT NOT NULL DEFAULT '',
  "dedupeKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "urgency" TEXT NOT NULL DEFAULT 'normal',
  "ownerUserId" TEXT,
  "requesterUserId" TEXT NOT NULL,
  "answer" TEXT NOT NULL DEFAULT '',
  "rationale" TEXT NOT NULL DEFAULT '',
  "impact" TEXT NOT NULL DEFAULT 'none',
  "dueAt" TIMESTAMP(3),
  "externalReference" TEXT,
  "followUpRequestId" TEXT,
  "answeredByUserId" TEXT,
  "answeredAt" TIMESTAMP(3),
  "acknowledgedByUserId" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InSprintClarification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InSprintClarificationRevision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clarificationId" TEXT NOT NULL,
  "fromRevision" INTEGER NOT NULL,
  "toRevision" INTEGER NOT NULL,
  "previousData" JSONB NOT NULL,
  "nextData" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InSprintClarificationRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClarificationAiSuggestion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clarificationId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "draftAnswer" TEXT NOT NULL,
  "informationUsed" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'proposed',
  "model" TEXT NOT NULL DEFAULT '',
  "generatedByUserId" TEXT NOT NULL,
  "actedByUserId" TEXT,
  "actedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClarificationAiSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InSprintClarification_organizationId_initiativeId_status_idx" ON "InSprintClarification"("organizationId", "initiativeId", "status");
CREATE INDEX "InSprintClarification_sprintId_status_createdAt_idx" ON "InSprintClarification"("sprintId", "status", "createdAt");
CREATE INDEX "InSprintClarification_storyId_status_idx" ON "InSprintClarification"("storyId", "status");
CREATE INDEX "InSprintClarification_bugId_status_idx" ON "InSprintClarification"("bugId", "status");
CREATE INDEX "InSprintClarification_ownerUserId_status_idx" ON "InSprintClarification"("ownerUserId", "status");
CREATE INDEX "InSprintClarification_requesterUserId_status_idx" ON "InSprintClarification"("requesterUserId", "status");
CREATE INDEX "InSprintClarification_followUpRequestId_idx" ON "InSprintClarification"("followUpRequestId");
CREATE UNIQUE INDEX "InSprintClarification_active_story_question_key" ON "InSprintClarification"("sprintId", "storyId", "dedupeKey") WHERE "storyId" IS NOT NULL AND "status" IN ('open','answered','acknowledged');
CREATE UNIQUE INDEX "InSprintClarification_active_bug_question_key" ON "InSprintClarification"("sprintId", "bugId", "dedupeKey") WHERE "bugId" IS NOT NULL AND "status" IN ('open','answered','acknowledged');
CREATE UNIQUE INDEX "InSprintClarificationRevision_clarificationId_toRevision_key" ON "InSprintClarificationRevision"("clarificationId", "toRevision");
CREATE INDEX "InSprintClarificationRevision_organizationId_createdAt_idx" ON "InSprintClarificationRevision"("organizationId", "createdAt");
CREATE INDEX "InSprintClarificationRevision_actorUserId_createdAt_idx" ON "InSprintClarificationRevision"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "ClarificationAiSuggestion_clarificationId_fingerprint_key" ON "ClarificationAiSuggestion"("clarificationId", "fingerprint");
CREATE INDEX "ClarificationAiSuggestion_organizationId_createdAt_idx" ON "ClarificationAiSuggestion"("organizationId", "createdAt");
CREATE INDEX "ClarificationAiSuggestion_clarificationId_status_createdAt_idx" ON "ClarificationAiSuggestion"("clarificationId", "status", "createdAt");

ALTER TABLE "InSprintClarification" ADD CONSTRAINT "InSprintClarification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InSprintClarification" ADD CONSTRAINT "InSprintClarification_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InSprintClarification" ADD CONSTRAINT "InSprintClarification_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InSprintClarification" ADD CONSTRAINT "InSprintClarification_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ArtifactLayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InSprintClarification" ADD CONSTRAINT "InSprintClarification_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "BugPlanningRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InSprintClarification" ADD CONSTRAINT "InSprintClarification_followUpRequestId_fkey" FOREIGN KEY ("followUpRequestId") REFERENCES "PlanningRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InSprintClarification" ADD CONSTRAINT "InSprintClarification_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InSprintClarification" ADD CONSTRAINT "InSprintClarification_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InSprintClarification" ADD CONSTRAINT "InSprintClarification_answeredByUserId_fkey" FOREIGN KEY ("answeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InSprintClarification" ADD CONSTRAINT "InSprintClarification_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InSprintClarification" ADD CONSTRAINT "InSprintClarification_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InSprintClarificationRevision" ADD CONSTRAINT "InSprintClarificationRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InSprintClarificationRevision" ADD CONSTRAINT "InSprintClarificationRevision_clarificationId_fkey" FOREIGN KEY ("clarificationId") REFERENCES "InSprintClarification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InSprintClarificationRevision" ADD CONSTRAINT "InSprintClarificationRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClarificationAiSuggestion" ADD CONSTRAINT "ClarificationAiSuggestion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClarificationAiSuggestion" ADD CONSTRAINT "ClarificationAiSuggestion_clarificationId_fkey" FOREIGN KEY ("clarificationId") REFERENCES "InSprintClarification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClarificationAiSuggestion" ADD CONSTRAINT "ClarificationAiSuggestion_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClarificationAiSuggestion" ADD CONSTRAINT "ClarificationAiSuggestion_actedByUserId_fkey" FOREIGN KEY ("actedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InSprintClarification"
  ADD CONSTRAINT "InSprintClarification_single_target_check" CHECK (num_nonnulls("storyId", "bugId") = 1),
  ADD CONSTRAINT "InSprintClarification_status_check" CHECK ("status" IN ('open','answered','acknowledged','resolved','withdrawn')),
  ADD CONSTRAINT "InSprintClarification_urgency_check" CHECK ("urgency" IN ('low','normal','high','urgent')),
  ADD CONSTRAINT "InSprintClarification_impact_check" CHECK ("impact" IN ('none','clarification_only','acceptance_criteria_change','scope_change','estimate_impact','schedule_impact','follow_up_work')),
  ADD CONSTRAINT "InSprintClarification_revision_check" CHECK ("revision" > 0),
  ADD CONSTRAINT "InSprintClarification_dedupe_key_check" CHECK (char_length("dedupeKey") = 64),
  ADD CONSTRAINT "InSprintClarification_question_check" CHECK (char_length(btrim("question")) > 0),
  ADD CONSTRAINT "InSprintClarification_answer_state_check" CHECK ("status" = 'open' OR "status" = 'withdrawn' OR (char_length(btrim("answer")) > 0 AND "answeredAt" IS NOT NULL AND "answeredByUserId" IS NOT NULL)),
  ADD CONSTRAINT "InSprintClarification_ack_state_check" CHECK ("status" <> 'acknowledged' OR ("acknowledgedAt" IS NOT NULL AND "acknowledgedByUserId" IS NOT NULL)),
  ADD CONSTRAINT "InSprintClarification_resolution_state_check" CHECK ("status" <> 'resolved' OR ("resolvedAt" IS NOT NULL AND "resolvedByUserId" IS NOT NULL));

ALTER TABLE "InSprintClarificationRevision"
  ADD CONSTRAINT "InSprintClarificationRevision_sequence_check" CHECK ("fromRevision" > 0 AND "toRevision" = "fromRevision" + 1),
  ADD CONSTRAINT "InSprintClarificationRevision_reason_check" CHECK (char_length(btrim("reason")) >= 3);

ALTER TABLE "ClarificationAiSuggestion"
  ADD CONSTRAINT "ClarificationAiSuggestion_status_check" CHECK ("status" IN ('proposed','used','dismissed','stale')),
  ADD CONSTRAINT "ClarificationAiSuggestion_fingerprint_check" CHECK (char_length("fingerprint") = 64),
  ADD CONSTRAINT "ClarificationAiSuggestion_action_check" CHECK (("status" IN ('proposed','stale') AND "actedAt" IS NULL AND "actedByUserId" IS NULL) OR ("status" IN ('used','dismissed') AND "actedAt" IS NOT NULL AND "actedByUserId" IS NOT NULL));

CREATE OR REPLACE FUNCTION validate_clarification_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = NEW."initiativeId" AND i."organizationId" = NEW."organizationId")
  THEN RAISE EXCEPTION 'Clarification tenant mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Sprint" s JOIN "Prototype" p ON p.id = s."prototypeId" WHERE s.id = NEW."sprintId" AND p."initiativeId" = NEW."initiativeId")
  THEN RAISE EXCEPTION 'Clarification sprint mismatch'; END IF;
  IF NEW."storyId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "SprintPlan" sp JOIN "SprintPlanningItem" spi ON spi."sprintPlanId" = sp.id
    JOIN "ArtifactLayer" a ON a.id = spi."storyId" JOIN "Prototype" p ON p.id = a."prototypeId"
    WHERE sp."sprintId" = NEW."sprintId" AND sp.status = 'committed' AND a.id = NEW."storyId"
      AND a.type = 'story' AND p."initiativeId" = NEW."initiativeId"
  ) THEN RAISE EXCEPTION 'Clarification story is not committed to this sprint'; END IF;
  IF NEW."bugId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "SprintPlan" sp JOIN "SprintPlanningItem" spi ON spi."sprintPlanId" = sp.id
    JOIN "BugPlanningRecord" b ON b.id = spi."bugId"
    WHERE sp."sprintId" = NEW."sprintId" AND sp.status = 'committed' AND b.id = NEW."bugId"
      AND b."initiativeId" = NEW."initiativeId"
  ) THEN RAISE EXCEPTION 'Clarification bug is not committed to this sprint'; END IF;
  IF NEW."followUpRequestId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "PlanningRequest" request WHERE request.id = NEW."followUpRequestId" AND request."initiativeId" = NEW."initiativeId"
  ) THEN RAISE EXCEPTION 'Clarification follow-up request mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES (NEW."requesterUserId"), (NEW."ownerUserId"), (NEW."answeredByUserId"), (NEW."acknowledgedByUserId"), (NEW."resolvedByUserId")) AS u(id)
    WHERE u.id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "User" app_user JOIN "OrganizationMember" member ON member."authUserId" = app_user."authUserId"
      WHERE app_user.id = u.id AND member."organizationId" = NEW."organizationId" AND member.status = 'active'
    )
  ) THEN RAISE EXCEPTION 'Clarification user tenant mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clarification_parent BEFORE INSERT OR UPDATE ON "InSprintClarification" FOR EACH ROW EXECUTE FUNCTION validate_clarification_parent();

CREATE OR REPLACE FUNCTION protect_clarification_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Clarification revisions are immutable';
END $$;
CREATE TRIGGER clarification_revision_immutable BEFORE UPDATE OR DELETE ON "InSprintClarificationRevision" FOR EACH ROW EXECUTE FUNCTION protect_clarification_revision();

CREATE OR REPLACE FUNCTION protect_clarification_suggestion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF ROW(NEW.id, NEW."organizationId", NEW."clarificationId", NEW.fingerprint, NEW."draftAnswer", NEW."informationUsed", NEW.model, NEW."generatedByUserId", NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD.id, OLD."organizationId", OLD."clarificationId", OLD.fingerprint, OLD."draftAnswer", OLD."informationUsed", OLD.model, OLD."generatedByUserId", OLD."createdAt")
  THEN RAISE EXCEPTION 'Clarification suggestion content is immutable'; END IF;
  IF OLD.status IN ('used','dismissed') AND NEW.status IS DISTINCT FROM OLD.status
  THEN RAISE EXCEPTION 'Acted-on clarification suggestions are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clarification_suggestion_immutable BEFORE UPDATE ON "ClarificationAiSuggestion" FOR EACH ROW EXECUTE FUNCTION protect_clarification_suggestion();

ALTER TABLE "InSprintClarification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InSprintClarificationRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClarificationAiSuggestion" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "InSprintClarification", "InSprintClarificationRevision", "ClarificationAiSuggestion" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON "InSprintClarification", "ClarificationAiSuggestion" TO app_rw;
GRANT SELECT, INSERT ON "InSprintClarificationRevision" TO app_rw;

CREATE POLICY clarification_all ON "InSprintClarification" FOR ALL TO app_rw
  USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY clarification_revision_select ON "InSprintClarificationRevision" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY clarification_revision_insert ON "InSprintClarificationRevision" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY clarification_suggestion_all ON "ClarificationAiSuggestion" FOR ALL TO app_rw
  USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
