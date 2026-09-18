-- Reject mismatched tenant and parent links at the database boundary. Existing
-- data is checked before enabling enforcement; no rows are deleted/reparented.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Initiative" i JOIN "Project" p ON p.id=i."projectId" WHERE i."organizationId" <> p."organizationId") THEN
    RAISE EXCEPTION 'Repair cross-organization initiative/project relationships before migrating';
  END IF;
END $$;

CREATE FUNCTION app_private.validate_planning_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'Initiative' THEN
    IF NOT EXISTS (SELECT 1 FROM public."Project" p WHERE p.id=NEW."projectId" AND p."organizationId"=NEW."organizationId") THEN
      RAISE EXCEPTION 'Project belongs to a different organization';
    END IF;
  ELSIF TG_TABLE_NAME = 'CapabilityDependency' THEN
    IF NOT EXISTS (SELECT 1 FROM public."Capability" a JOIN public."Capability" b ON a."intakeAnswerSetId"=b."intakeAnswerSetId"
      WHERE a.id=NEW."fromCapabilityId" AND b.id=NEW."toCapabilityId" AND a.id<>b.id) THEN
      RAISE EXCEPTION 'Dependency must connect distinct capabilities in one initiative';
    END IF;
  ELSIF TG_TABLE_NAME = 'ArtifactLayer' THEN
    IF NEW."parentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."ArtifactLayer" p WHERE p.id=NEW."parentId" AND p."prototypeId"=NEW."prototypeId") THEN
      RAISE EXCEPTION 'Artifact parent belongs to a different plan';
    END IF;
    IF NEW."sprintId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."Sprint" s WHERE s.id=NEW."sprintId" AND s."prototypeId"=NEW."prototypeId") THEN
      RAISE EXCEPTION 'Sprint belongs to a different plan';
    END IF;
  ELSIF TG_TABLE_NAME = 'IntegrationConnection' THEN
    IF NEW."initiativeId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."Initiative" i WHERE i.id=NEW."initiativeId" AND i."organizationId"=NEW."organizationId") THEN
      RAISE EXCEPTION 'Integration initiative belongs to a different organization';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.validate_planning_parent() FROM PUBLIC;
CREATE TRIGGER initiative_parent_consistency BEFORE INSERT OR UPDATE ON "Initiative" FOR EACH ROW EXECUTE FUNCTION app_private.validate_planning_parent();
CREATE TRIGGER dependency_parent_consistency BEFORE INSERT OR UPDATE ON "CapabilityDependency" FOR EACH ROW EXECUTE FUNCTION app_private.validate_planning_parent();
CREATE TRIGGER artifact_parent_consistency BEFORE INSERT OR UPDATE ON "ArtifactLayer" FOR EACH ROW EXECUTE FUNCTION app_private.validate_planning_parent();
CREATE TRIGGER integration_parent_consistency BEFORE INSERT OR UPDATE ON "IntegrationConnection" FOR EACH ROW EXECUTE FUNCTION app_private.validate_planning_parent();

-- Status on the global identity must also revoke database access.
CREATE OR REPLACE FUNCTION public.is_org_member(org_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public."OrganizationMember" m JOIN public."User" u ON u."authUserId"=m."authUserId"
    WHERE m."organizationId"=org_id AND m."authUserId"=auth.uid() AND m.status='active' AND u.status='active');
$$;
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public."OrganizationMember" m JOIN public."User" u ON u."authUserId"=m."authUserId"
    WHERE m."organizationId"=org_id AND m."authUserId"=auth.uid() AND m.status='active' AND u.status='active' AND m.role IN ('owner','admin'));
$$;
CREATE OR REPLACE FUNCTION public.is_org_owner(org_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public."OrganizationMember" m JOIN public."User" u ON u."authUserId"=m."authUserId"
    WHERE m."organizationId"=org_id AND m."authUserId"=auth.uid() AND m.status='active' AND u.status='active' AND m.role='owner');
$$;
