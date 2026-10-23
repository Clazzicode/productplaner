-- Workspace invites are high-entropy, one-use bearer links bound to an
-- authenticated, provider-confirmed email address. Only the SHA-256 token
-- digest is persisted. Membership is granted only by the narrowly-scoped
-- SECURITY DEFINER function below.
CREATE TABLE "OrganizationInvitation" (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
  "normalizedEmail" text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role = 'member'),
  "tokenHash" text NOT NULL UNIQUE CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  "invitedByAuthUserId" uuid NOT NULL REFERENCES "User"("authUserId") ON DELETE CASCADE,
  "expiresAt" timestamptz NOT NULL,
  "acceptedAt" timestamptz,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("normalizedEmail" = lower(btrim("normalizedEmail"))),
  CHECK ("acceptedAt" IS NULL OR "revokedAt" IS NULL)
);
CREATE INDEX organization_invitation_org_created_idx
  ON "OrganizationInvitation" ("organizationId", "createdAt" DESC);
CREATE INDEX organization_invitation_email_expiry_idx
  ON "OrganizationInvitation" ("normalizedEmail", "expiresAt");
CREATE UNIQUE INDEX organization_invitation_one_open_per_email_idx
  ON "OrganizationInvitation" ("organizationId", "normalizedEmail")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "OrganizationInvitation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "OrganizationInvitation" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "OrganizationInvitation" TO app_rw;
CREATE POLICY organization_invitation_select ON "OrganizationInvitation"
  FOR SELECT TO app_rw USING (is_org_admin("organizationId"));
CREATE POLICY organization_invitation_insert ON "OrganizationInvitation"
  FOR INSERT TO app_rw WITH CHECK (is_org_admin("organizationId") AND "invitedByAuthUserId" = auth.uid());
CREATE POLICY organization_invitation_update ON "OrganizationInvitation"
  FOR UPDATE TO app_rw USING (is_org_admin("organizationId"))
  WITH CHECK (is_org_admin("organizationId"));
CREATE POLICY organization_invitation_delete ON "OrganizationInvitation"
  FOR DELETE TO app_rw USING (is_org_admin("organizationId"));

CREATE FUNCTION app_private.protect_workspace_invitation_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."normalizedEmail" IS DISTINCT FROM OLD."normalizedEmail"
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW."tokenHash" IS DISTINCT FROM OLD."tokenHash"
    OR NEW."invitedByAuthUserId" IS DISTINCT FROM OLD."invitedByAuthUserId"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR current_user = 'app_rw' AND NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt"
    OR OLD."acceptedAt" IS NOT NULL AND NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt"
    OR OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt" THEN
    RAISE EXCEPTION 'Invitation identity and terminal state are immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.protect_workspace_invitation_identity() FROM PUBLIC;
CREATE TRIGGER protect_workspace_invitation_identity BEFORE UPDATE ON "OrganizationInvitation"
  FOR EACH ROW EXECUTE FUNCTION app_private.protect_workspace_invitation_identity();

CREATE FUNCTION app_private.accept_organization_invitation(p_token_hash text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_email text;
  v_org_id text;
  v_invitation_id text;
BEGIN
  IF v_auth_user_id IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid or unavailable invitation' USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = v_auth_user_id AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'A confirmed email address is required' USING ERRCODE = '42501';
  END IF;

  SELECT i.id, i."organizationId" INTO v_invitation_id, v_org_id
  FROM public."OrganizationInvitation" i
  WHERE i."tokenHash" = p_token_hash
    AND i."normalizedEmail" = v_email
    AND i.role = 'member'
    AND i."acceptedAt" IS NULL AND i."revokedAt" IS NULL
    AND i."expiresAt" > now()
  FOR UPDATE;
  IF v_invitation_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or unavailable invitation' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."OrganizationMember" m
    WHERE m."organizationId" = v_org_id AND m."authUserId" = v_auth_user_id
  ) THEN
    RAISE EXCEPTION 'This account already has a workspace membership' USING ERRCODE = '23505';
  END IF;

  UPDATE public."OrganizationInvitation" SET "acceptedAt" = now()
  WHERE id = v_invitation_id;
  INSERT INTO public."OrganizationMember" (id, "organizationId", "authUserId", role, status, "createdAt", "updatedAt")
  VALUES ('invite_' || gen_random_uuid()::text, v_org_id, v_auth_user_id, 'member', 'active', now(), now());
  RETURN v_org_id;
END;
$$;
REVOKE ALL ON FUNCTION app_private.accept_organization_invitation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.accept_organization_invitation(text) TO app_rw;
