CREATE TABLE "JiraConnection" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"initiativeId" TEXT,"configuredByUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'site_selection_required',"cloudId" TEXT,"siteUrl" TEXT,"siteName" TEXT,
  "projectId" TEXT,"projectKey" TEXT,"projectName" TEXT,"accessTokenCiphertext" TEXT NOT NULL,
  "refreshTokenCiphertext" TEXT NOT NULL,"tokenExpiresAt" TIMESTAMP(3) NOT NULL,"scopes" TEXT NOT NULL,
  "accessibleResources" JSONB NOT NULL DEFAULT '[]',"issueTypeMappings" JSONB NOT NULL DEFAULT '{}',
  "fieldMappings" JSONB NOT NULL DEFAULT '{}',"revision" INTEGER NOT NULL DEFAULT 1,"lastImportedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraConnection_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JiraOAuthState" (
  "id" TEXT NOT NULL,"stateHash" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"initiativeId" TEXT,"userId" TEXT NOT NULL,
  "returnPath" TEXT NOT NULL DEFAULT '/integrations/jira',"expiresAt" TIMESTAMP(3) NOT NULL,"consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "JiraOAuthState_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JiraImportRun" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"initiativeId" TEXT NOT NULL,"connectionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'previewed',"jql" TEXT NOT NULL,"sourceCursor" TEXT,"sourceFingerprint" TEXT NOT NULL,
  "itemCount" INTEGER NOT NULL DEFAULT 0,"createCount" INTEGER NOT NULL DEFAULT 0,"updateCount" INTEGER NOT NULL DEFAULT 0,
  "conflictCount" INTEGER NOT NULL DEFAULT 0,"unchangedCount" INTEGER NOT NULL DEFAULT 0,"initiatedByUserId" TEXT NOT NULL,
  "appliedByUserId" TEXT,"appliedAt" TIMESTAMP(3),"failureMessage" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "JiraImportRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JiraImportItem" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"importRunId" TEXT NOT NULL,"externalIssueId" TEXT NOT NULL,
  "externalKey" TEXT NOT NULL,"issueTypeId" TEXT NOT NULL,"issueTypeName" TEXT NOT NULL,"targetType" TEXT NOT NULL,
  "targetId" TEXT,"parentExternalKey" TEXT,"summary" TEXT NOT NULL,"sourceSnapshot" JSONB NOT NULL,"sourceHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,"conflictReason" TEXT,"selected" BOOLEAN NOT NULL DEFAULT true,"status" TEXT NOT NULL DEFAULT 'previewed',
  "failureMessage" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraImportItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JiraExternalLink" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"initiativeId" TEXT NOT NULL,"connectionId" TEXT NOT NULL,
  "externalIssueId" TEXT NOT NULL,"externalKey" TEXT NOT NULL,"issueTypeName" TEXT NOT NULL,"targetType" TEXT NOT NULL,"targetId" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,"targetFingerprint" TEXT NOT NULL,"sourceUpdatedAt" TIMESTAMP(3),"lastImportedSnapshot" JSONB NOT NULL,
  "lastImportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "JiraExternalLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JiraConnection_organizationId_initiativeId_status_idx" ON "JiraConnection"("organizationId","initiativeId","status");
CREATE INDEX "JiraConnection_cloudId_projectKey_idx" ON "JiraConnection"("cloudId","projectKey");
CREATE UNIQUE INDEX "JiraConnection_active_scope_key" ON "JiraConnection"("organizationId",COALESCE("initiativeId",'')) WHERE "status" <> 'revoked';
CREATE UNIQUE INDEX "JiraOAuthState_stateHash_key" ON "JiraOAuthState"("stateHash");
CREATE INDEX "JiraOAuthState_organizationId_expiresAt_idx" ON "JiraOAuthState"("organizationId","expiresAt");
CREATE INDEX "JiraImportRun_organizationId_initiativeId_createdAt_idx" ON "JiraImportRun"("organizationId","initiativeId","createdAt");
CREATE INDEX "JiraImportRun_connectionId_status_createdAt_idx" ON "JiraImportRun"("connectionId","status","createdAt");
CREATE UNIQUE INDEX "JiraImportItem_importRunId_externalIssueId_key" ON "JiraImportItem"("importRunId","externalIssueId");
CREATE INDEX "JiraImportItem_organizationId_importRunId_action_idx" ON "JiraImportItem"("organizationId","importRunId","action");
CREATE INDEX "JiraImportItem_externalKey_idx" ON "JiraImportItem"("externalKey");
CREATE UNIQUE INDEX "JiraExternalLink_connectionId_externalIssueId_key" ON "JiraExternalLink"("connectionId","externalIssueId");
CREATE UNIQUE INDEX "JiraExternalLink_connectionId_targetType_targetId_key" ON "JiraExternalLink"("connectionId","targetType","targetId");
CREATE INDEX "JiraExternalLink_organizationId_initiativeId_externalKey_idx" ON "JiraExternalLink"("organizationId","initiativeId","externalKey");

ALTER TABLE "JiraConnection"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("configuredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "JiraOAuthState"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "JiraImportRun"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("connectionId") REFERENCES "JiraConnection"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("appliedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "JiraImportItem"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("importRunId") REFERENCES "JiraImportRun"("id") ON DELETE CASCADE;
ALTER TABLE "JiraExternalLink"
  ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE,
  ADD FOREIGN KEY ("connectionId") REFERENCES "JiraConnection"("id") ON DELETE CASCADE;

ALTER TABLE "JiraConnection" ADD CHECK ("status" IN ('site_selection_required','project_selection_required','connected','reauthorization_required','revoked')),ADD CHECK ("revision">0),ADD CHECK (char_length("accessTokenCiphertext")>20),ADD CHECK (char_length("refreshTokenCiphertext")>20);
ALTER TABLE "JiraOAuthState" ADD CHECK (char_length("stateHash")=64),ADD CHECK ("returnPath" LIKE '/integrations/jira%');
ALTER TABLE "JiraImportRun" ADD CHECK ("status" IN ('previewed','applying','applied','cancelled','failed')),ADD CHECK (char_length("sourceFingerprint")=64),ADD CHECK ("itemCount">=0 AND "createCount">=0 AND "updateCount">=0 AND "conflictCount">=0 AND "unchangedCount">=0);
ALTER TABLE "JiraImportItem" ADD CHECK ("targetType" IN ('feature','story','bug','skip')),ADD CHECK ("action" IN ('create','update','unchanged','conflict','skip')),ADD CHECK ("status" IN ('previewed','imported','skipped','failed')),ADD CHECK (char_length("sourceHash")=64);
ALTER TABLE "JiraExternalLink" ADD CHECK ("targetType" IN ('feature','story','bug')),ADD CHECK (char_length("sourceHash")=64),ADD CHECK (char_length("targetFingerprint")=64);

CREATE FUNCTION validate_jira_initiative_parent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parent_org TEXT; BEGIN IF NEW."initiativeId" IS NOT NULL THEN SELECT "organizationId" INTO parent_org FROM "Initiative" WHERE id=NEW."initiativeId"; IF parent_org IS NULL OR parent_org<>NEW."organizationId" THEN RAISE EXCEPTION 'Jira initiative tenant mismatch'; END IF; END IF; RETURN NEW; END $$;
CREATE TRIGGER jira_connection_parent BEFORE INSERT OR UPDATE ON "JiraConnection" FOR EACH ROW EXECUTE FUNCTION validate_jira_initiative_parent();
CREATE TRIGGER jira_oauth_state_parent BEFORE INSERT OR UPDATE ON "JiraOAuthState" FOR EACH ROW EXECUTE FUNCTION validate_jira_initiative_parent();
CREATE FUNCTION validate_jira_import_parent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE connection_org TEXT; connection_initiative TEXT; BEGIN SELECT "organizationId","initiativeId" INTO connection_org,connection_initiative FROM "JiraConnection" WHERE id=NEW."connectionId"; IF connection_org IS NULL OR connection_org<>NEW."organizationId" OR connection_initiative IS DISTINCT FROM NEW."initiativeId" THEN RAISE EXCEPTION 'Jira import tenant mismatch'; END IF; RETURN NEW; END $$;
CREATE TRIGGER jira_import_parent BEFORE INSERT OR UPDATE ON "JiraImportRun" FOR EACH ROW EXECUTE FUNCTION validate_jira_import_parent();
CREATE FUNCTION validate_jira_import_item_parent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parent_org TEXT; BEGIN SELECT "organizationId" INTO parent_org FROM "JiraImportRun" WHERE id=NEW."importRunId"; IF parent_org IS NULL OR parent_org<>NEW."organizationId" THEN RAISE EXCEPTION 'Jira import item tenant mismatch'; END IF; RETURN NEW; END $$;
CREATE TRIGGER jira_import_item_parent BEFORE INSERT OR UPDATE ON "JiraImportItem" FOR EACH ROW EXECUTE FUNCTION validate_jira_import_item_parent();
CREATE TRIGGER jira_external_link_parent BEFORE INSERT OR UPDATE ON "JiraExternalLink" FOR EACH ROW EXECUTE FUNCTION validate_jira_import_parent();
CREATE FUNCTION protect_consumed_jira_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."consumedAt" IS NOT NULL THEN RAISE EXCEPTION 'Consumed OAuth state is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER jira_oauth_state_consumed_immutable BEFORE UPDATE OR DELETE ON "JiraOAuthState" FOR EACH ROW EXECUTE FUNCTION protect_consumed_jira_state();
CREATE FUNCTION protect_applied_jira_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status IN ('applied','cancelled') THEN RAISE EXCEPTION 'Finalized Jira import is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER jira_import_finalized_immutable BEFORE UPDATE OR DELETE ON "JiraImportRun" FOR EACH ROW EXECUTE FUNCTION protect_applied_jira_import();

ALTER TABLE "JiraConnection" ENABLE ROW LEVEL SECURITY;ALTER TABLE "JiraOAuthState" ENABLE ROW LEVEL SECURITY;ALTER TABLE "JiraImportRun" ENABLE ROW LEVEL SECURITY;ALTER TABLE "JiraImportItem" ENABLE ROW LEVEL SECURITY;ALTER TABLE "JiraExternalLink" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "JiraConnection","JiraOAuthState","JiraImportRun","JiraImportItem","JiraExternalLink" FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON "JiraConnection","JiraOAuthState","JiraImportRun","JiraImportItem","JiraExternalLink" TO app_rw;
CREATE POLICY jira_connection_all ON "JiraConnection" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY jira_oauth_state_all ON "JiraOAuthState" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY jira_import_run_all ON "JiraImportRun" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY jira_import_item_all ON "JiraImportItem" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY jira_external_link_all ON "JiraExternalLink" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
