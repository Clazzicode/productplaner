CREATE TABLE "DemoItem" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "initiativeId" TEXT NOT NULL,
  "sprintId" TEXT NOT NULL, "storyId" TEXT, "bugId" TEXT, "capabilityId" TEXT,
  "title" TEXT NOT NULL, "purpose" TEXT NOT NULL DEFAULT '', "presenterStakeholderId" TEXT,
  "presenterNameSnapshot" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'proposed',
  "readinessReason" TEXT NOT NULL DEFAULT '', "blockingReason" TEXT NOT NULL DEFAULT '',
  "overrideReason" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
  "completedWork" TEXT NOT NULL DEFAULT '', "plannedOrder" INTEGER NOT NULL DEFAULT 0,
  "repeatReason" TEXT NOT NULL DEFAULT '', "evidenceLinks" JSONB NOT NULL DEFAULT '[]',
  "carryoverSprintId" TEXT, "carryoverReason" TEXT NOT NULL DEFAULT '', "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL, "decidedByUserId" TEXT, "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DemoItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DemoItemRevision" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "demoItemId" TEXT NOT NULL,
  "fromRevision" INTEGER NOT NULL, "toRevision" INTEGER NOT NULL,
  "previousData" JSONB NOT NULL, "nextData" JSONB NOT NULL, "reason" TEXT NOT NULL,
  "actorUserId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemoItemRevision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DemoAiSuggestion" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "demoItemId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "content" TEXT NOT NULL,
  "informationUsed" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'proposed',
  "model" TEXT NOT NULL DEFAULT '', "generatedByUserId" TEXT NOT NULL,
  "actedByUserId" TEXT, "actedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemoAiSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemoItem_organizationId_initiativeId_status_idx" ON "DemoItem"("organizationId","initiativeId","status");
CREATE INDEX "DemoItem_sprintId_status_plannedOrder_idx" ON "DemoItem"("sprintId","status","plannedOrder");
CREATE INDEX "DemoItem_storyId_idx" ON "DemoItem"("storyId"); CREATE INDEX "DemoItem_bugId_idx" ON "DemoItem"("bugId");
CREATE INDEX "DemoItem_presenterStakeholderId_idx" ON "DemoItem"("presenterStakeholderId");
CREATE INDEX "DemoItem_carryoverSprintId_idx" ON "DemoItem"("carryoverSprintId");
CREATE UNIQUE INDEX "DemoItem_active_story_key" ON "DemoItem"("sprintId","storyId") WHERE "storyId" IS NOT NULL AND "repeatReason"='' AND status IN ('proposed','preparing','ready','not_ready','demonstrated');
CREATE UNIQUE INDEX "DemoItem_active_bug_key" ON "DemoItem"("sprintId","bugId") WHERE "bugId" IS NOT NULL AND "repeatReason"='' AND status IN ('proposed','preparing','ready','not_ready','demonstrated');
CREATE UNIQUE INDEX "DemoItemRevision_demoItemId_toRevision_key" ON "DemoItemRevision"("demoItemId","toRevision");
CREATE INDEX "DemoItemRevision_organizationId_createdAt_idx" ON "DemoItemRevision"("organizationId","createdAt");
CREATE UNIQUE INDEX "DemoAiSuggestion_demoItemId_kind_fingerprint_key" ON "DemoAiSuggestion"("demoItemId","kind","fingerprint");
CREATE INDEX "DemoAiSuggestion_organizationId_createdAt_idx" ON "DemoAiSuggestion"("organizationId","createdAt");
CREATE INDEX "DemoAiSuggestion_demoItemId_status_createdAt_idx" ON "DemoAiSuggestion"("demoItemId","status","createdAt");

ALTER TABLE "DemoItem" ADD CONSTRAINT "DemoItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DemoItem" ADD CONSTRAINT "DemoItem_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemoItem" ADD CONSTRAINT "DemoItem_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DemoItem" ADD CONSTRAINT "DemoItem_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ArtifactLayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DemoItem" ADD CONSTRAINT "DemoItem_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "BugPlanningRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DemoItem" ADD CONSTRAINT "DemoItem_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DemoItem" ADD CONSTRAINT "DemoItem_presenterStakeholderId_fkey" FOREIGN KEY ("presenterStakeholderId") REFERENCES "StakeholderContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DemoItem" ADD CONSTRAINT "DemoItem_carryoverSprintId_fkey" FOREIGN KEY ("carryoverSprintId") REFERENCES "Sprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DemoItem" ADD CONSTRAINT "DemoItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DemoItem" ADD CONSTRAINT "DemoItem_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DemoItemRevision" ADD CONSTRAINT "DemoItemRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DemoItemRevision" ADD CONSTRAINT "DemoItemRevision_demoItemId_fkey" FOREIGN KEY ("demoItemId") REFERENCES "DemoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemoItemRevision" ADD CONSTRAINT "DemoItemRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DemoAiSuggestion" ADD CONSTRAINT "DemoAiSuggestion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DemoAiSuggestion" ADD CONSTRAINT "DemoAiSuggestion_demoItemId_fkey" FOREIGN KEY ("demoItemId") REFERENCES "DemoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemoAiSuggestion" ADD CONSTRAINT "DemoAiSuggestion_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DemoAiSuggestion" ADD CONSTRAINT "DemoAiSuggestion_actedByUserId_fkey" FOREIGN KEY ("actedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DemoItem"
  ADD CONSTRAINT "DemoItem_single_target_check" CHECK (num_nonnulls("storyId","bugId")=1),
  ADD CONSTRAINT "DemoItem_status_check" CHECK (status IN ('proposed','preparing','ready','not_ready','demonstrated','skipped','carried_over')),
  ADD CONSTRAINT "DemoItem_revision_check" CHECK (revision > 0),
  ADD CONSTRAINT "DemoItem_title_check" CHECK (char_length(btrim(title)) >= 3),
  ADD CONSTRAINT "DemoItem_presenter_snapshot_check" CHECK ("presenterStakeholderId" IS NULL OR char_length(btrim("presenterNameSnapshot")) > 0),
  ADD CONSTRAINT "DemoItem_ready_check" CHECK (status <> 'ready' OR (char_length(btrim(purpose)) > 0 AND char_length(btrim("presenterNameSnapshot")) > 0 AND char_length(btrim("completedWork")) > 0)),
  ADD CONSTRAINT "DemoItem_not_ready_check" CHECK (status <> 'not_ready' OR char_length(btrim("blockingReason")) > 0),
  ADD CONSTRAINT "DemoItem_carryover_check" CHECK (status <> 'carried_over' OR ("carryoverSprintId" IS NOT NULL AND char_length(btrim("carryoverReason")) > 0)),
  ADD CONSTRAINT "DemoItem_evidence_links_check" CHECK (jsonb_typeof("evidenceLinks")='array');
ALTER TABLE "DemoItemRevision" ADD CONSTRAINT "DemoItemRevision_sequence_check" CHECK ("fromRevision">0 AND "toRevision"="fromRevision"+1), ADD CONSTRAINT "DemoItemRevision_reason_check" CHECK (char_length(btrim(reason))>=3);
ALTER TABLE "DemoAiSuggestion" ADD CONSTRAINT "DemoAiSuggestion_kind_check" CHECK (kind IN ('purpose','completed_work')), ADD CONSTRAINT "DemoAiSuggestion_status_check" CHECK (status IN ('proposed','used','dismissed','stale')), ADD CONSTRAINT "DemoAiSuggestion_fingerprint_check" CHECK (char_length(fingerprint)=64), ADD CONSTRAINT "DemoAiSuggestion_action_check" CHECK ((status IN ('proposed','stale') AND "actedAt" IS NULL AND "actedByUserId" IS NULL) OR (status IN ('used','dismissed') AND "actedAt" IS NOT NULL AND "actedByUserId" IS NOT NULL));

CREATE OR REPLACE FUNCTION validate_demo_item_parent() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id=NEW."initiativeId" AND i."organizationId"=NEW."organizationId") THEN RAISE EXCEPTION 'Demo tenant mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Sprint" s JOIN "Prototype" p ON p.id=s."prototypeId" WHERE s.id=NEW."sprintId" AND p."initiativeId"=NEW."initiativeId") THEN RAISE EXCEPTION 'Demo sprint mismatch'; END IF;
  IF NEW."storyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "SprintPlan" sp JOIN "SprintPlanningItem" spi ON spi."sprintPlanId"=sp.id JOIN "ArtifactLayer" a ON a.id=spi."storyId" JOIN "Prototype" p ON p.id=a."prototypeId" WHERE sp."sprintId"=NEW."sprintId" AND sp.status='committed' AND a.id=NEW."storyId" AND a.type='story' AND p."initiativeId"=NEW."initiativeId") THEN RAISE EXCEPTION 'Demo story is not committed to sprint'; END IF;
  IF NEW."bugId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "SprintPlan" sp JOIN "SprintPlanningItem" spi ON spi."sprintPlanId"=sp.id JOIN "BugPlanningRecord" b ON b.id=spi."bugId" WHERE sp."sprintId"=NEW."sprintId" AND sp.status='committed' AND b.id=NEW."bugId" AND b."initiativeId"=NEW."initiativeId") THEN RAISE EXCEPTION 'Demo bug is not committed to sprint'; END IF;
  IF NEW."capabilityId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Capability" c JOIN "IntakeAnswerSet" ias ON ias.id=c."intakeAnswerSetId" WHERE c.id=NEW."capabilityId" AND ias."initiativeId"=NEW."initiativeId") THEN RAISE EXCEPTION 'Demo feature mismatch'; END IF;
  IF NEW."presenterStakeholderId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "StakeholderContact" s WHERE s.id=NEW."presenterStakeholderId" AND s."organizationId"=NEW."organizationId" AND s."archivedAt" IS NULL) THEN RAISE EXCEPTION 'Demo presenter mismatch'; END IF;
  IF NEW."carryoverSprintId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Sprint" s JOIN "Prototype" p ON p.id=s."prototypeId" WHERE s.id=NEW."carryoverSprintId" AND p."initiativeId"=NEW."initiativeId" AND s.id<>NEW."sprintId") THEN RAISE EXCEPTION 'Demo carryover sprint mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM (VALUES(NEW."createdByUserId"),(NEW."decidedByUserId")) u(id) WHERE u.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" app_user JOIN "OrganizationMember" m ON m."authUserId"=app_user."authUserId" WHERE app_user.id=u.id AND m."organizationId"=NEW."organizationId" AND m.status='active')) THEN RAISE EXCEPTION 'Demo user mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER demo_item_parent BEFORE INSERT OR UPDATE ON "DemoItem" FOR EACH ROW EXECUTE FUNCTION validate_demo_item_parent();

CREATE OR REPLACE FUNCTION protect_demo_revision() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'Demo revisions are immutable'; END $$;
CREATE TRIGGER demo_revision_immutable BEFORE UPDATE OR DELETE ON "DemoItemRevision" FOR EACH ROW EXECUTE FUNCTION protect_demo_revision();
CREATE OR REPLACE FUNCTION protect_demo_suggestion() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF ROW(NEW.id,NEW."organizationId",NEW."demoItemId",NEW.kind,NEW.fingerprint,NEW.content,NEW."informationUsed",NEW.model,NEW."generatedByUserId",NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."organizationId",OLD."demoItemId",OLD.kind,OLD.fingerprint,OLD.content,OLD."informationUsed",OLD.model,OLD."generatedByUserId",OLD."createdAt") THEN RAISE EXCEPTION 'Demo suggestion content is immutable'; END IF;
 IF OLD.status IN ('used','dismissed') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Acted demo suggestions are immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER demo_suggestion_immutable BEFORE UPDATE ON "DemoAiSuggestion" FOR EACH ROW EXECUTE FUNCTION protect_demo_suggestion();

ALTER TABLE "DemoItem" ENABLE ROW LEVEL SECURITY; ALTER TABLE "DemoItemRevision" ENABLE ROW LEVEL SECURITY; ALTER TABLE "DemoAiSuggestion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "DemoItem","DemoItemRevision","DemoAiSuggestion" FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON "DemoItem","DemoAiSuggestion" TO app_rw; GRANT SELECT,INSERT ON "DemoItemRevision" TO app_rw;
CREATE POLICY demo_item_all ON "DemoItem" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY demo_revision_select ON "DemoItemRevision" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY demo_revision_insert ON "DemoItemRevision" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY demo_suggestion_all ON "DemoAiSuggestion" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
