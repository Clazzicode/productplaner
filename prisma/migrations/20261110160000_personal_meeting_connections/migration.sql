CREATE TABLE public."PersonalIntegrationConnection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES public."Organization"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL,
  "accountEmail" TEXT,
  "accountLabel" TEXT,
  "tokenCiphertext" TEXT NOT NULL,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonalIntegrationConnection_provider_check" CHECK ("provider" IN ('google_calendar','zoom','notion')),
  CONSTRAINT "PersonalIntegrationConnection_ciphertext_check" CHECK ("tokenCiphertext" LIKE 'v1.%'),
  CONSTRAINT "PersonalIntegrationConnection_organizationId_userId_provider_key" UNIQUE ("organizationId","userId","provider")
);
CREATE INDEX "PersonalIntegrationConnection_userId_provider_idx" ON public."PersonalIntegrationConnection"("userId","provider");
ALTER TABLE public."PersonalIntegrationConnection" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."PersonalIntegrationConnection" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."PersonalIntegrationConnection" TO app_rw;
CREATE POLICY personal_integration_select ON public."PersonalIntegrationConnection" FOR SELECT TO app_rw
  USING (public.is_org_member("organizationId") AND "userId" = public.current_app_user_id());
CREATE POLICY personal_integration_insert ON public."PersonalIntegrationConnection" FOR INSERT TO app_rw
  WITH CHECK (public.is_org_member("organizationId") AND "userId" = public.current_app_user_id());
CREATE POLICY personal_integration_update ON public."PersonalIntegrationConnection" FOR UPDATE TO app_rw
  USING (public.is_org_member("organizationId") AND "userId" = public.current_app_user_id())
  WITH CHECK (public.is_org_member("organizationId") AND "userId" = public.current_app_user_id());
CREATE POLICY personal_integration_delete ON public."PersonalIntegrationConnection" FOR DELETE TO app_rw
  USING (public.is_org_member("organizationId") AND "userId" = public.current_app_user_id());
CREATE FUNCTION app_private.prevent_personal_integration_reassignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId" OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."provider" IS DISTINCT FROM OLD."provider" THEN
    RAISE EXCEPTION 'Personal integration identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.prevent_personal_integration_reassignment() FROM PUBLIC;
CREATE TRIGGER prevent_personal_integration_reassignment BEFORE UPDATE ON public."PersonalIntegrationConnection"
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_personal_integration_reassignment();
