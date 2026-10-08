-- Keep the trigger's name resolution fixed and add the missing FK index.
CREATE OR REPLACE FUNCTION public.check_planning_request_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND NEW."initiativeId" <> OLD."initiativeId" THEN
   RAISE EXCEPTION 'Request initiative cannot change';
 END IF;
 IF NEW."capabilityId" IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public."Capability" c
   JOIN public."IntakeAnswerSet" a ON a.id = c."intakeAnswerSetId"
   WHERE c.id = NEW."capabilityId" AND a."initiativeId" = NEW."initiativeId"
 ) THEN RAISE EXCEPTION 'Request feature must belong to its initiative'; END IF;
 RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.check_planning_request_parent() FROM PUBLIC;
CREATE INDEX "PlanningRequest_capabilityId_idx" ON "PlanningRequest"("capabilityId");
