-- Canonical Atlassian Forge installation identity. Forge requests are not
-- Supabase user sessions, so writes go through the narrow SECURITY DEFINER
-- function below only after the application verifies the Forge Invocation
-- Token. The table itself is not writable through the Data API.

CREATE TABLE "AtlassianInstallation" (
  "id" TEXT NOT NULL,
  "forgeInstallationId" TEXT NOT NULL,
  "forgeAppId" TEXT NOT NULL,
  "cloudId" TEXT,
  "apiBaseUrl" TEXT NOT NULL,
  "organizationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending_link',
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastInvocationExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AtlassianInstallation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AtlassianInstallation_status_check" CHECK ("status" IN ('pending_link','active','disabled','uninstalled')),
  CONSTRAINT "AtlassianInstallation_api_url_check" CHECK ("apiBaseUrl" LIKE 'https://%')
);

CREATE UNIQUE INDEX "AtlassianInstallation_forgeInstallationId_key"
  ON "AtlassianInstallation"("forgeInstallationId");
CREATE INDEX "AtlassianInstallation_organizationId_status_idx"
  ON "AtlassianInstallation"("organizationId", "status");
CREATE INDEX "AtlassianInstallation_cloudId_idx"
  ON "AtlassianInstallation"("cloudId");

ALTER TABLE "AtlassianInstallation"
  ADD CONSTRAINT "AtlassianInstallation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AtlassianInstallation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AtlassianInstallation" FROM PUBLIC, anon, authenticated, app_rw;
GRANT SELECT ON "AtlassianInstallation" TO app_rw;

CREATE POLICY atlassian_installation_select ON "AtlassianInstallation"
  FOR SELECT TO app_rw
  USING ("organizationId" IS NOT NULL AND is_org_member("organizationId"));

CREATE FUNCTION app_private.upsert_atlassian_installation(
  p_id TEXT,
  p_forge_installation_id TEXT,
  p_forge_app_id TEXT,
  p_cloud_id TEXT,
  p_api_base_url TEXT,
  p_invocation_expires_at TIMESTAMP(3)
)
RETURNS TABLE (id TEXT, status TEXT, organization_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_id IS NULL OR p_forge_installation_id IS NULL OR p_forge_app_id IS NULL
     OR p_api_base_url IS NULL OR p_api_base_url NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Invalid Atlassian installation identity';
  END IF;

  RETURN QUERY
  INSERT INTO public."AtlassianInstallation" (
    "id", "forgeInstallationId", "forgeAppId", "cloudId", "apiBaseUrl",
    "status", "lastSeenAt", "lastInvocationExpiresAt", "updatedAt"
  ) VALUES (
    p_id, p_forge_installation_id, p_forge_app_id, p_cloud_id, p_api_base_url,
    'pending_link', CURRENT_TIMESTAMP, p_invocation_expires_at, CURRENT_TIMESTAMP
  )
  ON CONFLICT ("forgeInstallationId") DO UPDATE SET
    "forgeAppId" = EXCLUDED."forgeAppId",
    "cloudId" = EXCLUDED."cloudId",
    "apiBaseUrl" = EXCLUDED."apiBaseUrl",
    "lastSeenAt" = CURRENT_TIMESTAMP,
    "lastInvocationExpiresAt" = EXCLUDED."lastInvocationExpiresAt",
    "updatedAt" = CURRENT_TIMESTAMP
  RETURNING
    "AtlassianInstallation"."id",
    "AtlassianInstallation"."status",
    "AtlassianInstallation"."organizationId";
END;
$$;

REVOKE ALL ON FUNCTION app_private.upsert_atlassian_installation(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP(3)) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.upsert_atlassian_installation(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP(3)) TO app_rw;
