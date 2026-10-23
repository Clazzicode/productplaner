ALTER TABLE "JiraWorkItemMap"
  ADD COLUMN "lastJiraStatusId" TEXT,
  ADD COLUMN "lastJiraStatusName" TEXT,
  ADD COLUMN "lastJiraMappedStatus" TEXT,
  ADD COLUMN "lastJiraUpdatedAt" TIMESTAMP(3);

CREATE FUNCTION app_private.get_jira_status_sync_context(
  p_forge_installation_id TEXT,
  p_app_id TEXT,
  p_cloud_id TEXT,
  p_project_binding_id TEXT
)
RETURNS TABLE (organization_id TEXT, project_binding_id TEXT, jira_project_key TEXT, mapped_issues JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT b."organizationId", b.id, b."jiraProjectKey",
    COALESCE(jsonb_agg(jsonb_build_object('jiraIssueId', w."jiraIssueId", 'jiraIssueKey', w."jiraIssueKey")
      ORDER BY w."jiraIssueKey") FILTER (WHERE w.id IS NOT NULL), '[]'::jsonb)
  FROM public."JiraProjectBinding" b
  JOIN public."AtlassianInstallation" a ON a.id = b."installationId"
  LEFT JOIN LATERAL (
    SELECT m.id, m."jiraIssueId", m."jiraIssueKey"
    FROM public."JiraWorkItemMap" m
    WHERE m."projectBindingId" = b.id
    ORDER BY m."jiraIssueKey"
    LIMIT 51
  ) w ON true
  WHERE b.id = p_project_binding_id
    AND b.enabled = true
    AND a."forgeInstallationId" = p_forge_installation_id
    AND a."forgeAppId" = p_app_id
    AND a."cloudId" = p_cloud_id
    AND a.status = 'active'
    AND a."organizationId" = b."organizationId"
  GROUP BY b."organizationId", b.id, b."jiraProjectKey"
$$;
REVOKE ALL ON FUNCTION app_private.get_jira_status_sync_context(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.get_jira_status_sync_context(TEXT, TEXT, TEXT, TEXT) TO app_rw;

CREATE FUNCTION app_private.apply_jira_status_snapshot(
  p_forge_installation_id TEXT,
  p_app_id TEXT,
  p_cloud_id TEXT,
  p_project_binding_id TEXT,
  p_observations JSONB
)
RETURNS TABLE (matched_count INTEGER, changed_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  binding public."JiraProjectBinding"%ROWTYPE;
  matched INTEGER;
  changed INTEGER;
BEGIN
  IF p_observations IS NULL OR jsonb_typeof(p_observations) <> 'array' OR jsonb_array_length(p_observations) > 50 THEN
    RAISE EXCEPTION 'Invalid Jira status snapshot size';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_observations) AS o(
      "jiraIssueId" TEXT, "jiraIssueKey" TEXT, "statusId" TEXT,
      "statusName" TEXT, "updatedAt" TEXT, "snapshotHash" TEXT
    )
    WHERE o."jiraIssueId" IS NULL OR char_length(o."jiraIssueId") NOT BETWEEN 1 AND 64
      OR o."jiraIssueKey" IS NULL OR o."jiraIssueKey" !~ '^[A-Z][A-Z0-9_]{1,19}-[0-9]{1,10}$'
      OR o."statusId" IS NULL OR char_length(o."statusId") NOT BETWEEN 1 AND 64
      OR o."statusName" IS NULL OR char_length(o."statusName") NOT BETWEEN 1 AND 255
      OR o."updatedAt" IS NULL OR o."snapshotHash" IS NULL OR o."snapshotHash" !~ '^[a-f0-9]{64}$'
  ) THEN RAISE EXCEPTION 'Invalid Jira status observation'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_observations) AS o("jiraIssueId" TEXT)
    GROUP BY o."jiraIssueId" HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Duplicate Jira status observations'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_observations) AS o("jiraIssueKey" TEXT)
    GROUP BY o."jiraIssueKey" HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Duplicate Jira status observations'; END IF;

  SELECT b.* INTO binding
  FROM public."JiraProjectBinding" b
  JOIN public."AtlassianInstallation" a ON a.id = b."installationId"
  WHERE b.id = p_project_binding_id
    AND b.enabled = true
    AND a."forgeInstallationId" = p_forge_installation_id
    AND a."forgeAppId" = p_app_id
    AND a."cloudId" = p_cloud_id
    AND a.status = 'active'
    AND a."organizationId" = b."organizationId"
  FOR UPDATE OF b;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jira project binding is unavailable'; END IF;

  SELECT count(*)::INTEGER INTO matched
  FROM jsonb_to_recordset(p_observations) AS o(
    "jiraIssueId" TEXT, "jiraIssueKey" TEXT, "statusId" TEXT,
    "statusName" TEXT, "updatedAt" TEXT, "snapshotHash" TEXT
  )
  JOIN public."JiraWorkItemMap" w
    ON w."projectBindingId" = binding.id
    AND w."organizationId" = binding."organizationId"
    AND w."jiraIssueId" = o."jiraIssueId"
    AND w."jiraIssueKey" = o."jiraIssueKey";

  SELECT count(*)::INTEGER INTO changed
  FROM jsonb_to_recordset(p_observations) AS o(
    "jiraIssueId" TEXT, "jiraIssueKey" TEXT, "statusId" TEXT,
    "statusName" TEXT, "updatedAt" TEXT, "snapshotHash" TEXT
  )
  JOIN public."JiraWorkItemMap" w
    ON w."projectBindingId" = binding.id
    AND w."organizationId" = binding."organizationId"
    AND w."jiraIssueId" = o."jiraIssueId"
    AND w."jiraIssueKey" = o."jiraIssueKey"
  WHERE w."lastJiraHash" IS DISTINCT FROM o."snapshotHash";

  UPDATE public."JiraWorkItemMap" w SET
    "lastJiraHash" = o."snapshotHash",
    "lastJiraStatusId" = o."statusId",
    "lastJiraStatusName" = o."statusName",
    "lastJiraMappedStatus" = sm."localStatus",
    "lastJiraUpdatedAt" = (o."updatedAt"::timestamptz AT TIME ZONE 'UTC'),
    "lastSyncedAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM jsonb_to_recordset(p_observations) AS o(
    "jiraIssueId" TEXT, "jiraIssueKey" TEXT, "statusId" TEXT,
    "statusName" TEXT, "updatedAt" TEXT, "snapshotHash" TEXT
  )
  LEFT JOIN public."JiraStatusMapping" sm
    ON sm."projectBindingId" = p_project_binding_id AND sm."jiraStatusId" = o."statusId"
  WHERE w."projectBindingId" = binding.id
    AND w."organizationId" = binding."organizationId"
    AND w."jiraIssueId" = o."jiraIssueId"
    AND w."jiraIssueKey" = o."jiraIssueKey";

  IF matched > 0 THEN
    INSERT INTO public."AuditEvent" (
      id, "organizationId", "entityType", "entityId", action, metadata
    ) VALUES (
      gen_random_uuid()::text, binding."organizationId", 'jira_project_binding', binding.id,
      'jira.statuses.refreshed', jsonb_build_object('matched', matched, 'changed', changed)
    );
  END IF;
  RETURN QUERY SELECT matched, changed;
END;
$$;
REVOKE ALL ON FUNCTION app_private.apply_jira_status_snapshot(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.apply_jira_status_snapshot(TEXT, TEXT, TEXT, TEXT, JSONB) TO app_rw;
