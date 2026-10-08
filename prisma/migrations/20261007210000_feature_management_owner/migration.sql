ALTER TABLE "Capability" ADD COLUMN "ownerUserId" TEXT;

CREATE INDEX "Capability_ownerUserId_idx" ON "Capability"("ownerUserId");

ALTER TABLE "Capability"
  ADD CONSTRAINT "Capability_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.validate_capability_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_auth_id uuid;
  initiative_org_id text;
BEGIN
  IF NEW."ownerUserId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "authUserId" INTO owner_auth_id
  FROM "User"
  WHERE id = NEW."ownerUserId" AND status = 'active';

  SELECT i."organizationId" INTO initiative_org_id
  FROM "IntakeAnswerSet" intake
  JOIN "Initiative" i ON i.id = intake."initiativeId"
  WHERE intake.id = NEW."intakeAnswerSetId";

  IF owner_auth_id IS NULL OR initiative_org_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM "OrganizationMember" member
    WHERE member."organizationId" = initiative_org_id
      AND member."authUserId" = owner_auth_id
      AND member.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Capability owner must be an active member of the initiative organization';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Capability_validate_owner_membership"
BEFORE INSERT OR UPDATE OF "ownerUserId", "intakeAnswerSetId" ON "Capability"
FOR EACH ROW EXECUTE FUNCTION public.validate_capability_owner_membership();
