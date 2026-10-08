ALTER TABLE "Capability"
ADD COLUMN "releaseId" TEXT;

CREATE INDEX "Capability_releaseId_idx" ON "Capability"("releaseId");

ALTER TABLE "Capability"
ADD CONSTRAINT "Capability_releaseId_fkey"
FOREIGN KEY ("releaseId") REFERENCES "Release"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.validate_capability_release_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."releaseId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "Release" r
    JOIN "Prototype" p ON p.id = r."prototypeId"
    JOIN "IntakeAnswerSet" i ON i.id = NEW."intakeAnswerSetId"
    WHERE r.id = NEW."releaseId"
      AND p."initiativeId" = i."initiativeId"
  ) THEN
    RAISE EXCEPTION 'Feature and release must belong to the same initiative'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Capability_release_scope_guard"
BEFORE INSERT OR UPDATE OF "releaseId", "intakeAnswerSetId"
ON "Capability"
FOR EACH ROW
EXECUTE FUNCTION public.validate_capability_release_scope();
