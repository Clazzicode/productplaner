-- Atlassian OAuth credentials are kept outside ordinary public application
-- tables. Token material is additionally encrypted by the application with a
-- dedicated AES-256-GCM key before it reaches Postgres.
CREATE TABLE app_private."AtlassianOAuthState" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AtlassianOAuthState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AtlassianOAuthState_stateHash_key" UNIQUE ("stateHash"),
  CONSTRAINT "AtlassianOAuthState_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES public."Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "AtlassianOAuthState_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES public."User"("id") ON DELETE CASCADE,
  CONSTRAINT "AtlassianOAuthState_hash_check" CHECK (char_length("stateHash") = 64)
);
CREATE INDEX "AtlassianOAuthState_expiresAt_idx" ON app_private."AtlassianOAuthState"("expiresAt");
ALTER TABLE app_private."AtlassianOAuthState"
  ADD COLUMN "initiativeId" TEXT,
  ADD COLUMN "returnPath" TEXT NOT NULL DEFAULT '/integrations/jira',
  ADD CONSTRAINT "AtlassianOAuthState_initiativeId_fkey"
    FOREIGN KEY ("initiativeId") REFERENCES public."Initiative"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "AtlassianOAuthState_returnPath_check"
    CHECK ("returnPath" IN ('/integrations', '/integrations/jira'));
ALTER TABLE app_private."AtlassianOAuthState" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private."AtlassianOAuthState" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON app_private."AtlassianOAuthState" TO app_rw;

CREATE POLICY atlassian_oauth_state_select ON app_private."AtlassianOAuthState"
  FOR SELECT TO app_rw USING (
    public.is_org_admin("organizationId")
    AND "createdByUserId" = public.current_app_user_id()
  );
CREATE POLICY atlassian_oauth_state_insert ON app_private."AtlassianOAuthState"
  FOR INSERT TO app_rw WITH CHECK (
    public.is_org_admin("organizationId")
    AND "createdByUserId" = public.current_app_user_id()
  );
CREATE POLICY atlassian_oauth_state_delete ON app_private."AtlassianOAuthState"
  FOR DELETE TO app_rw USING (
    public.is_org_admin("organizationId")
    AND "createdByUserId" = public.current_app_user_id()
  );

CREATE TABLE app_private."AtlassianOAuthConnection" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "connectedByUserId" TEXT NOT NULL,
  "resourceMetadata" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "grantedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tokenCiphertext" TEXT NOT NULL,
  "accessTokenExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'connected',
  "connectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AtlassianOAuthConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AtlassianOAuthConnection_organizationId_key" UNIQUE ("organizationId"),
  CONSTRAINT "AtlassianOAuthConnection_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES public."Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "AtlassianOAuthConnection_connectedByUserId_fkey"
    FOREIGN KEY ("connectedByUserId") REFERENCES public."User"("id") ON DELETE RESTRICT,
  CONSTRAINT "AtlassianOAuthConnection_status_check" CHECK ("status" IN ('connected', 'reconnect_required')),
  CONSTRAINT "AtlassianOAuthConnection_ciphertext_check" CHECK ("tokenCiphertext" LIKE 'v1.%')
);
ALTER TABLE app_private."AtlassianOAuthConnection" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private."AtlassianOAuthConnection" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_private."AtlassianOAuthConnection" TO app_rw;

CREATE POLICY atlassian_oauth_connection_select ON app_private."AtlassianOAuthConnection"
  FOR SELECT TO app_rw USING (public.is_org_admin("organizationId"));
CREATE POLICY atlassian_oauth_connection_insert ON app_private."AtlassianOAuthConnection"
  FOR INSERT TO app_rw WITH CHECK (
    public.is_org_admin("organizationId")
    AND "connectedByUserId" = public.current_app_user_id()
  );
CREATE POLICY atlassian_oauth_connection_update ON app_private."AtlassianOAuthConnection"
  FOR UPDATE TO app_rw USING (public.is_org_admin("organizationId"))
  WITH CHECK (public.is_org_admin("organizationId"));
CREATE POLICY atlassian_oauth_connection_delete ON app_private."AtlassianOAuthConnection"
  FOR DELETE TO app_rw USING (public.is_org_admin("organizationId"));

CREATE FUNCTION app_private.prevent_atlassian_oauth_tenant_reassignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
    RAISE EXCEPTION 'Atlassian OAuth workspace is immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.prevent_atlassian_oauth_tenant_reassignment() FROM PUBLIC;
CREATE TRIGGER prevent_atlassian_oauth_tenant_reassignment
  BEFORE UPDATE ON app_private."AtlassianOAuthConnection"
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_atlassian_oauth_tenant_reassignment();

-- Members may see safe connection/permission status, but this function never
-- returns the encrypted credential envelope. Credential reads remain admin-
-- only even for the application role.
CREATE FUNCTION app_private.atlassian_oauth_status(p_organization_id TEXT)
RETURNS TABLE (
  status TEXT,
  resource_metadata JSONB,
  granted_scopes TEXT[],
  access_token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c."status", c."resourceMetadata", c."grantedScopes", c."accessTokenExpiresAt", c."connectedAt"
  FROM app_private."AtlassianOAuthConnection" c
  WHERE c."organizationId" = p_organization_id
    AND public.is_org_member(p_organization_id)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION app_private.atlassian_oauth_status(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.atlassian_oauth_status(TEXT) TO app_rw;

-- The legacy JiraConnection table remains the user-facing project/mapping
-- record, but it must not retain usable credentials. Existing links are marked
-- for reauthorization during rollout; new credentials are stored only in the
-- private OAuth table above.
UPDATE public."JiraConnection"
SET "accessTokenCiphertext" = 'vault-reference:' || "organizationId",
    "refreshTokenCiphertext" = 'vault-reference:' || "organizationId",
    "tokenExpiresAt" = now(),
    status = CASE WHEN status = 'revoked' THEN status ELSE 'reauthorization_required' END,
    "updatedAt" = now();
