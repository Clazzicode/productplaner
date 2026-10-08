CREATE TABLE "RequestRevision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "fromRevision" INTEGER NOT NULL,
  "toRevision" INTEGER NOT NULL,
  "previousData" JSONB,
  "nextData" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "changedByUserId" TEXT,
  "sourceAiAssistItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequestRevision_revision_check" CHECK ("fromRevision" >= 0 AND "toRevision" = "fromRevision" + 1),
  CONSTRAINT "RequestRevision_reason_check" CHECK (char_length(btrim("reason")) > 0)
);

CREATE UNIQUE INDEX "RequestRevision_sourceAiAssistItemId_key" ON "RequestRevision"("sourceAiAssistItemId");
CREATE UNIQUE INDEX "RequestRevision_requestId_toRevision_key" ON "RequestRevision"("requestId", "toRevision");
CREATE INDEX "RequestRevision_organizationId_createdAt_idx" ON "RequestRevision"("organizationId", "createdAt");
CREATE INDEX "RequestRevision_changedByUserId_idx" ON "RequestRevision"("changedByUserId");

ALTER TABLE "RequestRevision" ADD CONSTRAINT "RequestRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestRevision" ADD CONSTRAINT "RequestRevision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PlanningRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestRevision" ADD CONSTRAINT "RequestRevision_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequestRevision" ADD CONSTRAINT "RequestRevision_sourceAiAssistItemId_fkey" FOREIGN KEY ("sourceAiAssistItemId") REFERENCES "AiAssistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_request_revision_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "PlanningRequest" r JOIN "Initiative" i ON i.id = r."initiativeId"
    WHERE r.id = NEW."requestId" AND i."organizationId" = NEW."organizationId"
  ) THEN RAISE EXCEPTION 'Request revision tenant parent mismatch'; END IF;
  IF NEW."sourceAiAssistItemId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "AiAssistItem" a JOIN "PlanningRequest" r ON r.id = NEW."requestId"
    WHERE a.id = NEW."sourceAiAssistItemId" AND a."organizationId" = NEW."organizationId"
      AND a."initiativeId" = r."initiativeId" AND a."actionKey" = 'REVIEW_REQUIREMENTS'
  ) THEN RAISE EXCEPTION 'Request revision AI source mismatch'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER request_revision_parent BEFORE INSERT ON "RequestRevision"
FOR EACH ROW EXECUTE FUNCTION validate_request_revision_parent();

ALTER TABLE "RequestRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "RequestRevision" FROM anon, authenticated;
GRANT SELECT, INSERT ON "RequestRevision" TO app_rw;
CREATE POLICY request_revision_select ON "RequestRevision" FOR SELECT TO app_rw
  USING (is_org_member("organizationId"));
CREATE POLICY request_revision_insert ON "RequestRevision" FOR INSERT TO app_rw
  WITH CHECK (is_org_member("organizationId"));
