CREATE TABLE "PlanningMeeting" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "initiativeId" TEXT NOT NULL,
  "meetingType" TEXT NOT NULL, "sourceRefinementSessionId" TEXT, "sprintId" TEXT, "releaseId" TEXT,
  "title" TEXT NOT NULL, "scheduledAt" TIMESTAMP(3), "facilitatorStakeholderId" TEXT,
  "facilitatorNameSnapshot" TEXT NOT NULL DEFAULT '', "purpose" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
  "transcriptText" TEXT NOT NULL DEFAULT '', "transcriptDocumentId" TEXT, "outcome" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'draft', "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanningMeeting_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlanningMeetingParticipant" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "meetingId" TEXT NOT NULL, "stakeholderId" TEXT,
  "participantNameSnapshot" TEXT NOT NULL, "participantEmailSnapshot" TEXT, "role" TEXT NOT NULL DEFAULT 'participant',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PlanningMeetingParticipant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlanningMeetingWorkItem" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "meetingId" TEXT NOT NULL, "storyId" TEXT, "bugId" TEXT, "demoItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PlanningMeetingWorkItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlanningMeetingDecision" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "meetingId" TEXT NOT NULL, "title" TEXT NOT NULL, "rationale" TEXT NOT NULL DEFAULT '',
  "decisionMakerStakeholderId" TEXT, "decisionMakerNameSnapshot" TEXT NOT NULL DEFAULT '', "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanningMeetingDecision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlanningMeetingAction" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "meetingId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "ownerStakeholderId" TEXT, "ownerNameSnapshot" TEXT NOT NULL DEFAULT '', "dueAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'open',
  "completionNote" TEXT NOT NULL DEFAULT '', "completedAt" TIMESTAMP(3), "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanningMeetingAction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SprintReview" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "initiativeId" TEXT NOT NULL,
  "sprintId" TEXT NOT NULL, "meetingId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft', "draftSnapshot" JSONB NOT NULL,
  "finalSnapshot" JSONB, "missingWarnings" JSONB NOT NULL DEFAULT '[]', "summary" TEXT NOT NULL DEFAULT '',
  "overrideReason" TEXT NOT NULL DEFAULT '', "revision" INTEGER NOT NULL DEFAULT 1, "createdByUserId" TEXT NOT NULL,
  "finalizedByUserId" TEXT, "finalizedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SprintReview_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SprintReviewRevision" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "fromRevision" INTEGER NOT NULL,
  "toRevision" INTEGER NOT NULL, "previousData" JSONB NOT NULL, "nextData" JSONB NOT NULL, "reason" TEXT NOT NULL,
  "actorUserId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SprintReviewRevision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SprintReviewAiSuggestion" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL, "ordinal" INTEGER NOT NULL DEFAULT 0, "content" TEXT NOT NULL,
  "informationUsed" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'proposed', "model" TEXT NOT NULL DEFAULT '',
  "generatedByUserId" TEXT NOT NULL, "actedByUserId" TEXT, "actedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SprintReviewAiSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanningMeeting_sourceRefinementSessionId_key" ON "PlanningMeeting"("sourceRefinementSessionId");
CREATE INDEX "PlanningMeeting_organizationId_initiativeId_meetingType_idx" ON "PlanningMeeting"("organizationId","initiativeId","meetingType");
CREATE INDEX "PlanningMeeting_sprintId_idx" ON "PlanningMeeting"("sprintId"); CREATE INDEX "PlanningMeeting_releaseId_idx" ON "PlanningMeeting"("releaseId");
CREATE INDEX "PlanningMeeting_transcriptDocumentId_idx" ON "PlanningMeeting"("transcriptDocumentId");
CREATE UNIQUE INDEX "PlanningMeetingParticipant_meetingId_stakeholderId_key" ON "PlanningMeetingParticipant"("meetingId","stakeholderId");
CREATE INDEX "PlanningMeetingParticipant_organizationId_meetingId_idx" ON "PlanningMeetingParticipant"("organizationId","meetingId");
CREATE UNIQUE INDEX "PlanningMeetingWorkItem_meetingId_storyId_key" ON "PlanningMeetingWorkItem"("meetingId","storyId");
CREATE UNIQUE INDEX "PlanningMeetingWorkItem_meetingId_bugId_key" ON "PlanningMeetingWorkItem"("meetingId","bugId");
CREATE UNIQUE INDEX "PlanningMeetingWorkItem_meetingId_demoItemId_key" ON "PlanningMeetingWorkItem"("meetingId","demoItemId");
CREATE INDEX "PlanningMeetingWorkItem_organizationId_meetingId_idx" ON "PlanningMeetingWorkItem"("organizationId","meetingId");
CREATE INDEX "PlanningMeetingDecision_organizationId_meetingId_decidedAt_idx" ON "PlanningMeetingDecision"("organizationId","meetingId","decidedAt");
CREATE INDEX "PlanningMeetingAction_organizationId_meetingId_status_idx" ON "PlanningMeetingAction"("organizationId","meetingId","status");
CREATE UNIQUE INDEX "SprintReview_sprintId_key" ON "SprintReview"("sprintId"); CREATE UNIQUE INDEX "SprintReview_meetingId_key" ON "SprintReview"("meetingId");
CREATE INDEX "SprintReview_organizationId_initiativeId_status_idx" ON "SprintReview"("organizationId","initiativeId","status");
CREATE UNIQUE INDEX "SprintReviewRevision_reviewId_toRevision_key" ON "SprintReviewRevision"("reviewId","toRevision");
CREATE INDEX "SprintReviewRevision_organizationId_createdAt_idx" ON "SprintReviewRevision"("organizationId","createdAt");
CREATE UNIQUE INDEX "SprintReviewAiSuggestion_reviewId_kind_fingerprint_ordinal_key" ON "SprintReviewAiSuggestion"("reviewId","kind","fingerprint","ordinal");
CREATE INDEX "SprintReviewAiSuggestion_organizationId_createdAt_idx" ON "SprintReviewAiSuggestion"("organizationId","createdAt");
CREATE INDEX "SprintReviewAiSuggestion_reviewId_status_createdAt_idx" ON "SprintReviewAiSuggestion"("reviewId","status","createdAt");

ALTER TABLE "PlanningMeeting" ADD CONSTRAINT "PlanningMeeting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "PlanningMeeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "PlanningMeeting_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "PlanningMeeting_sourceRefinementSessionId_fkey" FOREIGN KEY ("sourceRefinementSessionId") REFERENCES "RefinementSession"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "PlanningMeeting_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "PlanningMeeting_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "PlanningMeeting_facilitatorStakeholderId_fkey" FOREIGN KEY ("facilitatorStakeholderId") REFERENCES "StakeholderContact"("id") ON DELETE SET NULL,
 ADD CONSTRAINT "PlanningMeeting_transcriptDocumentId_fkey" FOREIGN KEY ("transcriptDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL,
 ADD CONSTRAINT "PlanningMeeting_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "PlanningMeetingParticipant" ADD CONSTRAINT "PlanningMeetingParticipant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "PlanningMeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PlanningMeeting"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "PlanningMeetingParticipant_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "StakeholderContact"("id") ON DELETE SET NULL;
ALTER TABLE "PlanningMeetingWorkItem" ADD CONSTRAINT "PlanningMeetingWorkItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "PlanningMeetingWorkItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PlanningMeeting"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "PlanningMeetingWorkItem_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ArtifactLayer"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "PlanningMeetingWorkItem_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "BugPlanningRecord"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "PlanningMeetingWorkItem_demoItemId_fkey" FOREIGN KEY ("demoItemId") REFERENCES "DemoItem"("id") ON DELETE RESTRICT;
ALTER TABLE "PlanningMeetingDecision" ADD CONSTRAINT "PlanningMeetingDecision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "PlanningMeetingDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PlanningMeeting"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "PlanningMeetingDecision_decisionMakerStakeholderId_fkey" FOREIGN KEY ("decisionMakerStakeholderId") REFERENCES "StakeholderContact"("id") ON DELETE SET NULL,
 ADD CONSTRAINT "PlanningMeetingDecision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "PlanningMeetingAction" ADD CONSTRAINT "PlanningMeetingAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "PlanningMeetingAction_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PlanningMeeting"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "PlanningMeetingAction_ownerStakeholderId_fkey" FOREIGN KEY ("ownerStakeholderId") REFERENCES "StakeholderContact"("id") ON DELETE SET NULL,
 ADD CONSTRAINT "PlanningMeetingAction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "SprintReview" ADD CONSTRAINT "SprintReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "SprintReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "SprintReview_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "SprintReview_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "SprintReview_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PlanningMeeting"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "SprintReview_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "SprintReview_finalizedByUserId_fkey" FOREIGN KEY ("finalizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "SprintReviewRevision" ADD CONSTRAINT "SprintReviewRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "SprintReviewRevision_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "SprintReview"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "SprintReviewRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "SprintReviewAiSuggestion" ADD CONSTRAINT "SprintReviewAiSuggestion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "SprintReviewAiSuggestion_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "SprintReview"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "SprintReviewAiSuggestion_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "SprintReviewAiSuggestion_actedByUserId_fkey" FOREIGN KEY ("actedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;

ALTER TABLE "PlanningMeeting" ADD CONSTRAINT "PlanningMeeting_type_check" CHECK ("meetingType" IN ('refinement','sprint_planning','sprint_review','stakeholder_review','release_readiness')),
 ADD CONSTRAINT "PlanningMeeting_status_check" CHECK (status IN ('draft','in_progress','finalized','cancelled')),
 ADD CONSTRAINT "PlanningMeeting_title_check" CHECK (char_length(btrim(title))>=3),
 ADD CONSTRAINT "PlanningMeeting_facilitator_snapshot_check" CHECK ("facilitatorStakeholderId" IS NULL OR char_length(btrim("facilitatorNameSnapshot"))>0);
ALTER TABLE "PlanningMeetingParticipant" ADD CONSTRAINT "PlanningMeetingParticipant_name_check" CHECK (char_length(btrim("participantNameSnapshot"))>0);
ALTER TABLE "PlanningMeetingWorkItem" ADD CONSTRAINT "PlanningMeetingWorkItem_target_check" CHECK (num_nonnulls("storyId","bugId","demoItemId")=1);
ALTER TABLE "PlanningMeetingDecision" ADD CONSTRAINT "PlanningMeetingDecision_title_check" CHECK (char_length(btrim(title))>0),
 ADD CONSTRAINT "PlanningMeetingDecision_snapshot_check" CHECK ("decisionMakerStakeholderId" IS NULL OR char_length(btrim("decisionMakerNameSnapshot"))>0);
ALTER TABLE "PlanningMeetingAction" ADD CONSTRAINT "PlanningMeetingAction_status_check" CHECK (status IN ('open','completed','cancelled')),
 ADD CONSTRAINT "PlanningMeetingAction_title_check" CHECK (char_length(btrim(title))>0),
 ADD CONSTRAINT "PlanningMeetingAction_snapshot_check" CHECK ("ownerStakeholderId" IS NULL OR char_length(btrim("ownerNameSnapshot"))>0);
ALTER TABLE "SprintReview" ADD CONSTRAINT "SprintReview_status_check" CHECK (status IN ('draft','finalized')),
 ADD CONSTRAINT "SprintReview_revision_check" CHECK (revision>0),
 ADD CONSTRAINT "SprintReview_warning_check" CHECK (jsonb_typeof("missingWarnings")='array'),
 ADD CONSTRAINT "SprintReview_finalized_check" CHECK (status<>'finalized' OR ("finalSnapshot" IS NOT NULL AND "finalizedAt" IS NOT NULL AND "finalizedByUserId" IS NOT NULL));
ALTER TABLE "SprintReviewRevision" ADD CONSTRAINT "SprintReviewRevision_sequence_check" CHECK ("fromRevision">0 AND "toRevision"="fromRevision"+1),
 ADD CONSTRAINT "SprintReviewRevision_reason_check" CHECK (char_length(btrim(reason))>=3);
ALTER TABLE "SprintReviewAiSuggestion" ADD CONSTRAINT "SprintReviewAiSuggestion_kind_check" CHECK (kind IN ('summary','follow_up')),
 ADD CONSTRAINT "SprintReviewAiSuggestion_status_check" CHECK (status IN ('proposed','used','dismissed','stale')),
 ADD CONSTRAINT "SprintReviewAiSuggestion_fingerprint_check" CHECK (char_length(fingerprint)=64),
 ADD CONSTRAINT "SprintReviewAiSuggestion_action_check" CHECK ((status IN ('proposed','stale') AND "actedAt" IS NULL AND "actedByUserId" IS NULL) OR (status IN ('used','dismissed') AND "actedAt" IS NOT NULL AND "actedByUserId" IS NOT NULL));

CREATE OR REPLACE FUNCTION validate_planning_meeting_parent() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id=NEW."initiativeId" AND i."organizationId"=NEW."organizationId" AND i."projectId"=NEW."projectId") THEN RAISE EXCEPTION 'Meeting tenant mismatch'; END IF;
 IF NEW."sprintId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Sprint" s JOIN "Prototype" p ON p.id=s."prototypeId" WHERE s.id=NEW."sprintId" AND p."initiativeId"=NEW."initiativeId") THEN RAISE EXCEPTION 'Meeting sprint mismatch'; END IF;
 IF NEW."releaseId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Release" r JOIN "Prototype" p ON p.id=r."prototypeId" WHERE r.id=NEW."releaseId" AND p."initiativeId"=NEW."initiativeId") THEN RAISE EXCEPTION 'Meeting release mismatch'; END IF;
 IF NEW."facilitatorStakeholderId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "StakeholderContact" s WHERE s.id=NEW."facilitatorStakeholderId" AND s."organizationId"=NEW."organizationId" AND s."archivedAt" IS NULL) THEN RAISE EXCEPTION 'Meeting facilitator mismatch'; END IF;
 IF NEW."transcriptDocumentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Document" d WHERE d.id=NEW."transcriptDocumentId" AND d."organizationId"=NEW."organizationId" AND d."initiativeId"=NEW."initiativeId") THEN RAISE EXCEPTION 'Meeting document mismatch'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "User" u JOIN "OrganizationMember" m ON m."authUserId"=u."authUserId" WHERE u.id=NEW."createdByUserId" AND m."organizationId"=NEW."organizationId" AND m.status='active') THEN RAISE EXCEPTION 'Meeting creator mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planning_meeting_parent BEFORE INSERT OR UPDATE ON "PlanningMeeting" FOR EACH ROW EXECUTE FUNCTION validate_planning_meeting_parent();

CREATE OR REPLACE FUNCTION validate_planning_meeting_child() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE meeting_org TEXT; meeting_initiative TEXT; row_data JSONB; target_id TEXT;
BEGIN
 row_data := to_jsonb(NEW);
 SELECT "organizationId","initiativeId" INTO meeting_org,meeting_initiative FROM "PlanningMeeting" WHERE id=NEW."meetingId";
 IF meeting_org IS NULL OR meeting_org<>NEW."organizationId" THEN RAISE EXCEPTION 'Meeting child tenant mismatch'; END IF;
 IF TG_TABLE_NAME='PlanningMeetingParticipant' THEN target_id := row_data->>'stakeholderId'; IF target_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "StakeholderContact" s WHERE s.id=target_id AND s."organizationId"=meeting_org AND s."archivedAt" IS NULL) THEN RAISE EXCEPTION 'Meeting participant mismatch'; END IF; END IF;
 IF TG_TABLE_NAME='PlanningMeetingDecision' THEN target_id := row_data->>'decisionMakerStakeholderId'; IF target_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "StakeholderContact" s WHERE s.id=target_id AND s."organizationId"=meeting_org) THEN RAISE EXCEPTION 'Meeting decision maker mismatch'; END IF; END IF;
 IF TG_TABLE_NAME='PlanningMeetingAction' THEN target_id := row_data->>'ownerStakeholderId'; IF target_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "StakeholderContact" s WHERE s.id=target_id AND s."organizationId"=meeting_org) THEN RAISE EXCEPTION 'Meeting action owner mismatch'; END IF; END IF;
 IF TG_TABLE_NAME='PlanningMeetingWorkItem' THEN
  target_id := row_data->>'storyId'; IF target_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ArtifactLayer" a JOIN "Prototype" p ON p.id=a."prototypeId" WHERE a.id=target_id AND p."initiativeId"=meeting_initiative AND a.type='story') THEN RAISE EXCEPTION 'Meeting story mismatch'; END IF;
  target_id := row_data->>'bugId'; IF target_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "BugPlanningRecord" b WHERE b.id=target_id AND b."initiativeId"=meeting_initiative) THEN RAISE EXCEPTION 'Meeting bug mismatch'; END IF;
  target_id := row_data->>'demoItemId'; IF target_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "DemoItem" d WHERE d.id=target_id AND d."initiativeId"=meeting_initiative) THEN RAISE EXCEPTION 'Meeting demo mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planning_meeting_participant_parent BEFORE INSERT OR UPDATE ON "PlanningMeetingParticipant" FOR EACH ROW EXECUTE FUNCTION validate_planning_meeting_child();
CREATE TRIGGER planning_meeting_work_parent BEFORE INSERT OR UPDATE ON "PlanningMeetingWorkItem" FOR EACH ROW EXECUTE FUNCTION validate_planning_meeting_child();
CREATE TRIGGER planning_meeting_decision_parent BEFORE INSERT OR UPDATE ON "PlanningMeetingDecision" FOR EACH ROW EXECUTE FUNCTION validate_planning_meeting_child();
CREATE TRIGGER planning_meeting_action_parent BEFORE INSERT OR UPDATE ON "PlanningMeetingAction" FOR EACH ROW EXECUTE FUNCTION validate_planning_meeting_child();

CREATE OR REPLACE FUNCTION validate_sprint_review_parent() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "PlanningMeeting" m WHERE m.id=NEW."meetingId" AND m."meetingType"='sprint_review' AND m."organizationId"=NEW."organizationId" AND m."initiativeId"=NEW."initiativeId" AND m."projectId"=NEW."projectId" AND m."sprintId"=NEW."sprintId") THEN RAISE EXCEPTION 'Sprint review meeting mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM (VALUES(NEW."createdByUserId"),(NEW."finalizedByUserId")) u(id) WHERE u.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" app_user JOIN "OrganizationMember" m ON m."authUserId"=app_user."authUserId" WHERE app_user.id=u.id AND m."organizationId"=NEW."organizationId" AND m.status='active')) THEN RAISE EXCEPTION 'Sprint review user mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sprint_review_parent BEFORE INSERT OR UPDATE ON "SprintReview" FOR EACH ROW EXECUTE FUNCTION validate_sprint_review_parent();

CREATE OR REPLACE FUNCTION protect_final_sprint_review() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN IF OLD.status='finalized' AND NEW."finalSnapshot" IS DISTINCT FROM OLD."finalSnapshot" THEN RAISE EXCEPTION 'Final sprint review snapshot is immutable; reopen first'; END IF; RETURN NEW; END $$;
CREATE TRIGGER sprint_review_final_snapshot BEFORE UPDATE ON "SprintReview" FOR EACH ROW EXECUTE FUNCTION protect_final_sprint_review();
CREATE OR REPLACE FUNCTION protect_sprint_review_revision() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'Sprint review revisions are immutable'; END $$;
CREATE TRIGGER sprint_review_revision_immutable BEFORE UPDATE OR DELETE ON "SprintReviewRevision" FOR EACH ROW EXECUTE FUNCTION protect_sprint_review_revision();
CREATE OR REPLACE FUNCTION protect_sprint_review_suggestion() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF ROW(NEW.id,NEW."organizationId",NEW."reviewId",NEW.kind,NEW.fingerprint,NEW.ordinal,NEW.content,NEW."informationUsed",NEW.model,NEW."generatedByUserId",NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."organizationId",OLD."reviewId",OLD.kind,OLD.fingerprint,OLD.ordinal,OLD.content,OLD."informationUsed",OLD.model,OLD."generatedByUserId",OLD."createdAt") THEN RAISE EXCEPTION 'Sprint review suggestion content is immutable'; END IF;
 IF OLD.status IN ('used','dismissed') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Acted sprint review suggestions are immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER sprint_review_suggestion_immutable BEFORE UPDATE ON "SprintReviewAiSuggestion" FOR EACH ROW EXECUTE FUNCTION protect_sprint_review_suggestion();

-- Adapter: preserve existing refinement records while projecting their shared
-- meeting fields into the reusable meeting foundation.
INSERT INTO "PlanningMeeting" (id,"organizationId","projectId","initiativeId","meetingType","sourceRefinementSessionId",title,"scheduledAt","facilitatorNameSnapshot",purpose,notes,outcome,status,"createdByUserId","createdAt","updatedAt")
SELECT 'refinement:'||r.id,r."organizationId",r."projectId",r."initiativeId",'refinement',r.id,r.title,r."scheduledAt",COALESCE(u.name,''),r.purpose,r.notes,r.summary,
 CASE r.status WHEN 'completed' THEN 'finalized' WHEN 'cancelled' THEN 'cancelled' WHEN 'in_progress' THEN 'in_progress' ELSE 'draft' END,r."createdByUserId",r."createdAt",r."updatedAt"
FROM "RefinementSession" r LEFT JOIN "User" u ON u.id=r."facilitatorUserId" ON CONFLICT ("sourceRefinementSessionId") DO NOTHING;
CREATE OR REPLACE FUNCTION sync_refinement_planning_meeting() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO "PlanningMeeting" (id,"organizationId","projectId","initiativeId","meetingType","sourceRefinementSessionId",title,"scheduledAt","facilitatorNameSnapshot",purpose,notes,outcome,status,"createdByUserId","createdAt","updatedAt")
 VALUES ('refinement:'||NEW.id,NEW."organizationId",NEW."projectId",NEW."initiativeId",'refinement',NEW.id,NEW.title,NEW."scheduledAt",COALESCE((SELECT name FROM "User" WHERE id=NEW."facilitatorUserId"),''),NEW.purpose,NEW.notes,NEW.summary,
 CASE NEW.status WHEN 'completed' THEN 'finalized' WHEN 'cancelled' THEN 'cancelled' WHEN 'in_progress' THEN 'in_progress' ELSE 'draft' END,NEW."createdByUserId",NEW."createdAt",NEW."updatedAt")
 ON CONFLICT ("sourceRefinementSessionId") DO UPDATE SET title=EXCLUDED.title,"scheduledAt"=EXCLUDED."scheduledAt","facilitatorNameSnapshot"=EXCLUDED."facilitatorNameSnapshot",purpose=EXCLUDED.purpose,notes=EXCLUDED.notes,outcome=EXCLUDED.outcome,status=EXCLUDED.status,"updatedAt"=EXCLUDED."updatedAt";
 RETURN NEW;
END $$;
CREATE TRIGGER refinement_planning_meeting_adapter AFTER INSERT OR UPDATE ON "RefinementSession" FOR EACH ROW EXECUTE FUNCTION sync_refinement_planning_meeting();

ALTER TABLE "PlanningMeeting" ENABLE ROW LEVEL SECURITY; ALTER TABLE "PlanningMeetingParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanningMeetingWorkItem" ENABLE ROW LEVEL SECURITY; ALTER TABLE "PlanningMeetingDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanningMeetingAction" ENABLE ROW LEVEL SECURITY; ALTER TABLE "SprintReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SprintReviewRevision" ENABLE ROW LEVEL SECURITY; ALTER TABLE "SprintReviewAiSuggestion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PlanningMeeting","PlanningMeetingParticipant","PlanningMeetingWorkItem","PlanningMeetingDecision","PlanningMeetingAction","SprintReview","SprintReviewRevision","SprintReviewAiSuggestion" FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON "PlanningMeeting","PlanningMeetingDecision","PlanningMeetingAction","SprintReview","SprintReviewAiSuggestion" TO app_rw;
GRANT SELECT,INSERT,DELETE ON "PlanningMeetingParticipant","PlanningMeetingWorkItem" TO app_rw;
GRANT SELECT,INSERT ON "SprintReviewRevision" TO app_rw;
CREATE POLICY planning_meeting_all ON "PlanningMeeting" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY planning_meeting_participant_all ON "PlanningMeetingParticipant" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY planning_meeting_work_all ON "PlanningMeetingWorkItem" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY planning_meeting_decision_all ON "PlanningMeetingDecision" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY planning_meeting_action_all ON "PlanningMeetingAction" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY sprint_review_all ON "SprintReview" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY sprint_review_revision_select ON "SprintReviewRevision" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY sprint_review_revision_insert ON "SprintReviewRevision" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY sprint_review_suggestion_all ON "SprintReviewAiSuggestion" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
