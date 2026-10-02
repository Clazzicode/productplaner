-- Additive PO request storage. No existing data is removed.
CREATE TABLE "PlanningRequest" (
  "id" TEXT PRIMARY KEY,
  "initiativeId" TEXT NOT NULL REFERENCES "Initiative"("id") ON DELETE CASCADE,
  "data" JSONB NOT NULL CHECK (jsonb_typeof("data") = 'object'),
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "capabilityId" TEXT REFERENCES "Capability"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PlanningRequest_initiativeId_updatedAt_idx" ON "PlanningRequest"("initiativeId", "updatedAt");
ALTER TABLE "PlanningRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PlanningRequest" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PlanningRequest" TO app_rw;
CREATE POLICY planning_request_tenant ON "PlanningRequest" FOR ALL TO app_rw
 USING (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "PlanningRequest"."initiativeId" AND is_org_member(i."organizationId")))
 WITH CHECK (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "PlanningRequest"."initiativeId" AND is_org_member(i."organizationId")));
CREATE FUNCTION check_planning_request_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND NEW."initiativeId" <> OLD."initiativeId" THEN
   RAISE EXCEPTION 'Request initiative cannot change';
 END IF;
 IF NEW."capabilityId" IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "Capability" c JOIN "IntakeAnswerSet" a ON a.id = c."intakeAnswerSetId"
   WHERE c.id = NEW."capabilityId" AND a."initiativeId" = NEW."initiativeId"
 ) THEN RAISE EXCEPTION 'Request feature must belong to its initiative'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION check_planning_request_parent() FROM PUBLIC;
CREATE TRIGGER planning_request_parent BEFORE INSERT OR UPDATE ON "PlanningRequest"
 FOR EACH ROW EXECUTE FUNCTION check_planning_request_parent();
