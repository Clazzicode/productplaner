CREATE TABLE "JiraExportRun" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"initiativeId" TEXT NOT NULL,"connectionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'previewed',"sourceFingerprint" TEXT NOT NULL,"itemCount" INTEGER NOT NULL DEFAULT 0,
  "createCount" INTEGER NOT NULL DEFAULT 0,"updateCount" INTEGER NOT NULL DEFAULT 0,"conflictCount" INTEGER NOT NULL DEFAULT 0,
  "unchangedCount" INTEGER NOT NULL DEFAULT 0,"initiatedByUserId" TEXT NOT NULL,"executedByUserId" TEXT,"executedAt" TIMESTAMP(3),
  "failureMessage" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraExportRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JiraExportItem" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"exportRunId" TEXT NOT NULL,"targetType" TEXT NOT NULL,"targetId" TEXT NOT NULL,
  "summary" TEXT NOT NULL,"externalIssueId" TEXT,"externalKey" TEXT,"action" TEXT NOT NULL,"requestPayload" JSONB NOT NULL,
  "targetFingerprint" TEXT NOT NULL,"expectedSourceHash" TEXT,"idempotencyKey" TEXT NOT NULL,"conflictReason" TEXT,
  "selected" BOOLEAN NOT NULL DEFAULT true,"status" TEXT NOT NULL DEFAULT 'previewed',"resultSnapshot" JSONB,"failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraExportItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JiraExportApproval" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"exportRunId" TEXT NOT NULL,"selectedItemIds" JSONB NOT NULL,
  "reason" TEXT NOT NULL,"snapshotHash" TEXT NOT NULL,"approvedByUserId" TEXT NOT NULL,"approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JiraExportApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JiraExportRun_organizationId_initiativeId_createdAt_idx" ON "JiraExportRun"("organizationId","initiativeId","createdAt");
CREATE INDEX "JiraExportRun_connectionId_status_createdAt_idx" ON "JiraExportRun"("connectionId","status","createdAt");
CREATE UNIQUE INDEX "JiraExportItem_exportRunId_targetType_targetId_key" ON "JiraExportItem"("exportRunId","targetType","targetId");
CREATE UNIQUE INDEX "JiraExportItem_idempotencyKey_key" ON "JiraExportItem"("idempotencyKey");
CREATE INDEX "JiraExportItem_organizationId_exportRunId_action_idx" ON "JiraExportItem"("organizationId","exportRunId","action");
CREATE INDEX "JiraExportItem_externalKey_idx" ON "JiraExportItem"("externalKey");
CREATE UNIQUE INDEX "JiraExportApproval_exportRunId_key" ON "JiraExportApproval"("exportRunId");
CREATE INDEX "JiraExportApproval_organizationId_approvedAt_idx" ON "JiraExportApproval"("organizationId","approvedAt");

ALTER TABLE "JiraExportRun"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("connectionId") REFERENCES "JiraConnection"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("executedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "JiraExportItem"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("exportRunId") REFERENCES "JiraExportRun"("id") ON DELETE CASCADE;
ALTER TABLE "JiraExportApproval"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("exportRunId") REFERENCES "JiraExportRun"("id") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "JiraExportRun" ADD CHECK ("status" IN ('previewed','approved','executing','completed','partial_failure','cancelled')),ADD CHECK (char_length("sourceFingerprint")=64),ADD CHECK ("itemCount">=0 AND "createCount">=0 AND "updateCount">=0 AND "conflictCount">=0 AND "unchangedCount">=0);
ALTER TABLE "JiraExportItem" ADD CHECK ("targetType" IN ('feature','story','bug')),ADD CHECK ("action" IN ('create','update','unchanged','conflict','skip')),ADD CHECK ("status" IN ('previewed','pending','succeeded','failed','skipped','conflict')),ADD CHECK (char_length("targetFingerprint")=64),ADD CHECK ("expectedSourceHash" IS NULL OR char_length("expectedSourceHash")=64),ADD CHECK (char_length("idempotencyKey")=64);
ALTER TABLE "JiraExportApproval" ADD CHECK (char_length(trim("reason"))>=5),ADD CHECK (char_length("snapshotHash")=64),ADD CHECK (jsonb_typeof("selectedItemIds")='array');

CREATE TRIGGER jira_export_parent BEFORE INSERT OR UPDATE ON "JiraExportRun" FOR EACH ROW EXECUTE FUNCTION validate_jira_import_parent();
CREATE FUNCTION validate_jira_export_item_parent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parent_org TEXT; BEGIN SELECT "organizationId" INTO parent_org FROM "JiraExportRun" WHERE id=NEW."exportRunId"; IF parent_org IS NULL OR parent_org<>NEW."organizationId" THEN RAISE EXCEPTION 'Jira export item tenant mismatch'; END IF; RETURN NEW; END $$;
CREATE TRIGGER jira_export_item_parent BEFORE INSERT OR UPDATE ON "JiraExportItem" FOR EACH ROW EXECUTE FUNCTION validate_jira_export_item_parent();
CREATE TRIGGER jira_export_approval_parent BEFORE INSERT OR UPDATE ON "JiraExportApproval" FOR EACH ROW EXECUTE FUNCTION validate_jira_export_item_parent();
CREATE FUNCTION protect_jira_export_approval() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Jira export approval is immutable'; END $$;
CREATE TRIGGER jira_export_approval_immutable BEFORE UPDATE OR DELETE ON "JiraExportApproval" FOR EACH ROW EXECUTE FUNCTION protect_jira_export_approval();
CREATE FUNCTION protect_final_jira_export() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status IN ('completed','partial_failure','cancelled') THEN RAISE EXCEPTION 'Finalized Jira export is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER jira_export_final_immutable BEFORE UPDATE OR DELETE ON "JiraExportRun" FOR EACH ROW EXECUTE FUNCTION protect_final_jira_export();
CREATE FUNCTION protect_approved_jira_export_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM "JiraExportApproval" WHERE "exportRunId"=OLD."exportRunId") AND (NEW."targetType",NEW."targetId",NEW.action,NEW."requestPayload",NEW."targetFingerprint",NEW."expectedSourceHash",NEW."idempotencyKey",NEW.selected) IS DISTINCT FROM (OLD."targetType",OLD."targetId",OLD.action,OLD."requestPayload",OLD."targetFingerprint",OLD."expectedSourceHash",OLD."idempotencyKey",OLD.selected) THEN RAISE EXCEPTION 'Approved Jira export payload is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER jira_export_item_approved_immutable BEFORE UPDATE OR DELETE ON "JiraExportItem" FOR EACH ROW EXECUTE FUNCTION protect_approved_jira_export_item();

ALTER TABLE "JiraExportRun" ENABLE ROW LEVEL SECURITY;ALTER TABLE "JiraExportItem" ENABLE ROW LEVEL SECURITY;ALTER TABLE "JiraExportApproval" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "JiraExportRun","JiraExportItem","JiraExportApproval" FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON "JiraExportRun","JiraExportItem" TO app_rw;
GRANT SELECT,INSERT ON "JiraExportApproval" TO app_rw;
CREATE POLICY jira_export_run_all ON "JiraExportRun" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY jira_export_item_all ON "JiraExportItem" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY jira_export_approval_select ON "JiraExportApproval" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY jira_export_approval_insert ON "JiraExportApproval" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
