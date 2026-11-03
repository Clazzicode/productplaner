-- Tenant-scoped Jira pairing and canonical mapping records.

CREATE TABLE "AtlassianPairingCode" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "installationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AtlassianPairingCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AtlassianPairingCode_hash_check" CHECK (char_length("codeHash") = 64)
);

CREATE TABLE "JiraProjectBinding" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "initiativeId" TEXT NOT NULL,
  "jiraProjectId" TEXT NOT NULL,
  "jiraProjectKey" TEXT NOT NULL,
  "jiraProjectName" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JiraProjectBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JiraIssueTypeMapping" (
  "id" TEXT NOT NULL,
  "projectBindingId" TEXT NOT NULL,
  "localType" TEXT NOT NULL,
  "jiraIssueTypeId" TEXT NOT NULL,
  "jiraIssueTypeName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JiraIssueTypeMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JiraIssueTypeMapping_local_type_check" CHECK ("localType" IN ('epic','story'))
);

CREATE TABLE "JiraFieldMapping" (
  "id" TEXT NOT NULL,
  "projectBindingId" TEXT NOT NULL,
  "localEntityType" TEXT NOT NULL,
  "localField" TEXT NOT NULL,
  "jiraFieldId" TEXT NOT NULL,
  "jiraFieldName" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "conflictOwner" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JiraFieldMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JiraFieldMapping_entity_type_check" CHECK ("localEntityType" IN ('epic','story')),
  CONSTRAINT "JiraFieldMapping_direction_check" CHECK ("direction" IN ('planner_to_jira','jira_to_planner','bidirectional')),
  CONSTRAINT "JiraFieldMapping_conflict_owner_check" CHECK ("conflictOwner" IN ('planner','jira','require_review'))
);

CREATE TABLE "JiraStatusMapping" (
  "id" TEXT NOT NULL,
  "projectBindingId" TEXT NOT NULL,
  "jiraStatusId" TEXT NOT NULL,
  "jiraStatusName" TEXT NOT NULL,
  "localStatus" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JiraStatusMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JiraWorkItemMap" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectBindingId" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "jiraIssueId" TEXT NOT NULL,
  "jiraIssueKey" TEXT NOT NULL,
  "lastPlannerHash" TEXT,
  "lastJiraHash" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JiraWorkItemMap_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AtlassianPairingCode" ADD CONSTRAINT "AtlassianPairingCode_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtlassianPairingCode" ADD CONSTRAINT "AtlassianPairingCode_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AtlassianPairingCode" ADD CONSTRAINT "AtlassianPairingCode_installationId_fkey"
  FOREIGN KEY ("installationId") REFERENCES "AtlassianInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JiraProjectBinding" ADD CONSTRAINT "JiraProjectBinding_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JiraProjectBinding" ADD CONSTRAINT "JiraProjectBinding_installationId_fkey"
  FOREIGN KEY ("installationId") REFERENCES "AtlassianInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JiraProjectBinding" ADD CONSTRAINT "JiraProjectBinding_initiativeId_fkey"
  FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JiraIssueTypeMapping" ADD CONSTRAINT "JiraIssueTypeMapping_projectBindingId_fkey"
  FOREIGN KEY ("projectBindingId") REFERENCES "JiraProjectBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JiraFieldMapping" ADD CONSTRAINT "JiraFieldMapping_projectBindingId_fkey"
  FOREIGN KEY ("projectBindingId") REFERENCES "JiraProjectBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JiraStatusMapping" ADD CONSTRAINT "JiraStatusMapping_projectBindingId_fkey"
  FOREIGN KEY ("projectBindingId") REFERENCES "JiraProjectBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JiraWorkItemMap" ADD CONSTRAINT "JiraWorkItemMap_projectBindingId_fkey"
  FOREIGN KEY ("projectBindingId") REFERENCES "JiraProjectBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JiraWorkItemMap" ADD CONSTRAINT "JiraWorkItemMap_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "ArtifactLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AtlassianPairingCode_codeHash_key" ON "AtlassianPairingCode"("codeHash");
CREATE INDEX "AtlassianPairingCode_organizationId_expiresAt_idx" ON "AtlassianPairingCode"("organizationId", "expiresAt");
CREATE UNIQUE INDEX "JiraProjectBinding_installationId_jiraProjectId_key" ON "JiraProjectBinding"("installationId", "jiraProjectId");
CREATE UNIQUE INDEX "JiraProjectBinding_initiativeId_installationId_key" ON "JiraProjectBinding"("initiativeId", "installationId");
CREATE INDEX "JiraProjectBinding_organizationId_initiativeId_idx" ON "JiraProjectBinding"("organizationId", "initiativeId");
CREATE UNIQUE INDEX "JiraIssueTypeMapping_projectBindingId_localType_key" ON "JiraIssueTypeMapping"("projectBindingId", "localType");
CREATE UNIQUE INDEX "JiraIssueTypeMapping_projectBindingId_jiraIssueTypeId_key" ON "JiraIssueTypeMapping"("projectBindingId", "jiraIssueTypeId");
CREATE UNIQUE INDEX "JiraFieldMapping_projectBindingId_localEntityType_localField_key" ON "JiraFieldMapping"("projectBindingId", "localEntityType", "localField");
CREATE UNIQUE INDEX "JiraFieldMapping_projectBindingId_jiraFieldId_key" ON "JiraFieldMapping"("projectBindingId", "jiraFieldId");
CREATE UNIQUE INDEX "JiraStatusMapping_projectBindingId_jiraStatusId_key" ON "JiraStatusMapping"("projectBindingId", "jiraStatusId");
CREATE UNIQUE INDEX "JiraWorkItemMap_projectBindingId_artifactId_key" ON "JiraWorkItemMap"("projectBindingId", "artifactId");
CREATE UNIQUE INDEX "JiraWorkItemMap_projectBindingId_jiraIssueId_key" ON "JiraWorkItemMap"("projectBindingId", "jiraIssueId");
CREATE INDEX "JiraWorkItemMap_organizationId_jiraIssueKey_idx" ON "JiraWorkItemMap"("organizationId", "jiraIssueKey");

ALTER TABLE "AtlassianPairingCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JiraProjectBinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JiraIssueTypeMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JiraFieldMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JiraStatusMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JiraWorkItemMap" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "AtlassianPairingCode", "JiraProjectBinding", "JiraIssueTypeMapping", "JiraFieldMapping", "JiraStatusMapping", "JiraWorkItemMap" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON "AtlassianPairingCode" TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON "JiraProjectBinding", "JiraIssueTypeMapping", "JiraFieldMapping", "JiraStatusMapping", "JiraWorkItemMap" TO app_rw;

CREATE POLICY jira_pairing_select ON "AtlassianPairingCode" FOR SELECT TO app_rw USING (is_org_admin("organizationId"));
CREATE POLICY jira_pairing_insert ON "AtlassianPairingCode" FOR INSERT TO app_rw WITH CHECK (
  is_org_admin("organizationId") AND "createdByUserId" = current_app_user_id()
  AND "expiresAt" > CURRENT_TIMESTAMP AND "expiresAt" <= CURRENT_TIMESTAMP + interval '15 minutes'
);
CREATE POLICY jira_project_binding_select ON "JiraProjectBinding" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY jira_project_binding_insert ON "JiraProjectBinding" FOR INSERT TO app_rw WITH CHECK (is_org_admin("organizationId"));
CREATE POLICY jira_project_binding_update ON "JiraProjectBinding" FOR UPDATE TO app_rw USING (is_org_admin("organizationId")) WITH CHECK (is_org_admin("organizationId"));
CREATE POLICY jira_project_binding_delete ON "JiraProjectBinding" FOR DELETE TO app_rw USING (is_org_admin("organizationId"));

CREATE POLICY jira_issue_type_mapping_select ON "JiraIssueTypeMapping" FOR SELECT TO app_rw
  USING (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_member(b."organizationId")));
CREATE POLICY jira_issue_type_mapping_insert ON "JiraIssueTypeMapping" FOR INSERT TO app_rw
  WITH CHECK (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_admin(b."organizationId")));
CREATE POLICY jira_issue_type_mapping_update ON "JiraIssueTypeMapping" FOR UPDATE TO app_rw
  USING (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_admin(b."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_admin(b."organizationId")));
CREATE POLICY jira_issue_type_mapping_delete ON "JiraIssueTypeMapping" FOR DELETE TO app_rw
  USING (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_admin(b."organizationId")));
CREATE POLICY jira_field_mapping_select ON "JiraFieldMapping" FOR SELECT TO app_rw
  USING (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_member(b."organizationId")));
CREATE POLICY jira_field_mapping_insert ON "JiraFieldMapping" FOR INSERT TO app_rw
  WITH CHECK (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_admin(b."organizationId")));
CREATE POLICY jira_field_mapping_update ON "JiraFieldMapping" FOR UPDATE TO app_rw
  USING (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_admin(b."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_admin(b."organizationId")));
CREATE POLICY jira_field_mapping_delete ON "JiraFieldMapping" FOR DELETE TO app_rw
  USING (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_admin(b."organizationId")));
CREATE POLICY jira_status_mapping_select ON "JiraStatusMapping" FOR SELECT TO app_rw
  USING (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_member(b."organizationId")));
CREATE POLICY jira_status_mapping_insert ON "JiraStatusMapping" FOR INSERT TO app_rw
  WITH CHECK (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_admin(b."organizationId")));
CREATE POLICY jira_status_mapping_update ON "JiraStatusMapping" FOR UPDATE TO app_rw
  USING (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_admin(b."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_admin(b."organizationId")));
CREATE POLICY jira_status_mapping_delete ON "JiraStatusMapping" FOR DELETE TO app_rw
  USING (EXISTS (SELECT 1 FROM "JiraProjectBinding" b WHERE b.id = "projectBindingId" AND is_org_admin(b."organizationId")));
CREATE POLICY jira_work_item_map_select ON "JiraWorkItemMap" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY jira_work_item_map_insert ON "JiraWorkItemMap" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY jira_work_item_map_update ON "JiraWorkItemMap" FOR UPDATE TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));

CREATE FUNCTION app_private.validate_jira_project_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Initiative" i
    JOIN public."AtlassianInstallation" a ON a.id = NEW."installationId"
    WHERE i.id = NEW."initiativeId" AND i."organizationId" = NEW."organizationId"
      AND a."organizationId" = NEW."organizationId" AND a.status = 'active'
      AND a."cloudId" IS NOT NULL
  ) THEN RAISE EXCEPTION 'Jira project binding tenant or installation mismatch'; END IF;
  IF NEW."jiraProjectKey" !~ '^[A-Z][A-Z0-9_]{1,19}$' OR char_length(NEW."jiraProjectId") > 64 THEN
    RAISE EXCEPTION 'Invalid Jira project identity';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.validate_jira_project_binding() FROM PUBLIC;
CREATE TRIGGER validate_jira_project_binding BEFORE INSERT OR UPDATE ON "JiraProjectBinding"
  FOR EACH ROW EXECUTE FUNCTION app_private.validate_jira_project_binding();

CREATE FUNCTION app_private.validate_jira_work_item_map()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."JiraProjectBinding" b
    JOIN public."Initiative" i ON i.id = b."initiativeId" AND i."organizationId" = b."organizationId"
    JOIN public."Prototype" p ON p."initiativeId" = i.id
    JOIN public."ArtifactLayer" a ON a.id = NEW."artifactId" AND a."prototypeId" = p.id
    WHERE b.id = NEW."projectBindingId" AND b."organizationId" = NEW."organizationId"
  ) THEN RAISE EXCEPTION 'Jira work item mapping tenant or artifact mismatch'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.validate_jira_work_item_map() FROM PUBLIC;
CREATE TRIGGER validate_jira_work_item_map BEFORE INSERT OR UPDATE ON "JiraWorkItemMap"
  FOR EACH ROW EXECUTE FUNCTION app_private.validate_jira_work_item_map();

CREATE FUNCTION app_private.consume_atlassian_pairing_code(p_code_hash TEXT, p_installation_id TEXT, p_app_id TEXT)
RETURNS TABLE (organization_id TEXT, installation_id TEXT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pairing public."AtlassianPairingCode"%ROWTYPE;
  installation public."AtlassianInstallation"%ROWTYPE;
BEGIN
  SELECT * INTO pairing FROM public."AtlassianPairingCode"
    WHERE "codeHash" = p_code_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired Jira pairing code'; END IF;
  SELECT * INTO installation FROM public."AtlassianInstallation"
    WHERE "forgeInstallationId" = p_installation_id FOR UPDATE;
  IF NOT FOUND OR installation."forgeAppId" <> p_app_id OR installation."cloudId" IS NULL THEN
    RAISE EXCEPTION 'Forge installation is invalid';
  END IF;
  IF pairing."consumedAt" IS NOT NULL THEN
    IF pairing."installationId" = installation.id AND installation."organizationId" = pairing."organizationId" THEN
      RETURN QUERY SELECT pairing."organizationId", installation.id, installation.status;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Jira pairing code was already used';
  END IF;
  IF pairing."expiresAt" <= CURRENT_TIMESTAMP OR installation."organizationId" IS NOT NULL OR installation.status <> 'pending_link' THEN
    RAISE EXCEPTION 'Invalid or expired Jira pairing code';
  END IF;

  UPDATE public."AtlassianPairingCode"
    SET "consumedAt" = CURRENT_TIMESTAMP, "installationId" = installation.id
    WHERE id = pairing.id;
  UPDATE public."AtlassianInstallation"
    SET "organizationId" = pairing."organizationId", status = 'active', "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = installation.id;
  INSERT INTO public."AuditEvent" (
    id, "organizationId", "actorUserId", "entityType", "entityId", action, metadata
  ) VALUES (
    gen_random_uuid()::text, pairing."organizationId", pairing."createdByUserId",
    'atlassian_installation', installation.id, 'atlassian.installation.paired',
    jsonb_build_object('cloudId', installation."cloudId")
  );
  RETURN QUERY SELECT pairing."organizationId", installation.id, 'active'::text;
END;
$$;
REVOKE ALL ON FUNCTION app_private.consume_atlassian_pairing_code(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.consume_atlassian_pairing_code(TEXT, TEXT, TEXT) TO app_rw;

CREATE FUNCTION app_private.get_active_atlassian_installation(p_forge_installation_id TEXT, p_app_id TEXT, p_cloud_id TEXT)
RETURNS TABLE (id TEXT, organization_id TEXT, cloud_id TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id, a."organizationId", a."cloudId"
  FROM public."AtlassianInstallation" a
  WHERE a."forgeInstallationId" = p_forge_installation_id
    AND a."forgeAppId" = p_app_id
    AND a."cloudId" = p_cloud_id
    AND a.status = 'active'
    AND a."organizationId" IS NOT NULL
$$;
REVOKE ALL ON FUNCTION app_private.get_active_atlassian_installation(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.get_active_atlassian_installation(TEXT, TEXT, TEXT) TO app_rw;
