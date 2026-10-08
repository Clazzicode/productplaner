ALTER TABLE "PlanningRequest" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "PlanningRequest" ADD COLUMN "sourceRecordId" TEXT;

CREATE TABLE "RequestSourceRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "initiativeId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "rawContent" TEXT NOT NULL,
  "locator" TEXT,
  "fingerprint" TEXT NOT NULL,
  "documentId" TEXT,
  "contextItemId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestSourceRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequestSourceRecord_type_check" CHECK ("type" IN ('spreadsheet_row', 'document_finding', 'meeting_note')),
  CONSTRAINT "RequestSourceRecord_origin_check" CHECK (
    ("type" = 'meeting_note' AND "documentId" IS NULL AND "contextItemId" IS NULL)
    OR ("type" = 'spreadsheet_row' AND "documentId" IS NOT NULL AND "contextItemId" IS NULL)
    OR ("type" = 'document_finding' AND "documentId" IS NOT NULL AND "contextItemId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "PlanningRequest_initiativeId_dedupeKey_key" ON "PlanningRequest"("initiativeId", "dedupeKey");
CREATE INDEX "PlanningRequest_sourceRecordId_idx" ON "PlanningRequest"("sourceRecordId");
CREATE UNIQUE INDEX "RequestSourceRecord_initiativeId_fingerprint_key" ON "RequestSourceRecord"("initiativeId", "fingerprint");
CREATE INDEX "RequestSourceRecord_documentId_idx" ON "RequestSourceRecord"("documentId");
CREATE INDEX "RequestSourceRecord_contextItemId_idx" ON "RequestSourceRecord"("contextItemId");
CREATE INDEX "RequestSourceRecord_createdByUserId_idx" ON "RequestSourceRecord"("createdByUserId");

ALTER TABLE "RequestSourceRecord" ADD CONSTRAINT "RequestSourceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestSourceRecord" ADD CONSTRAINT "RequestSourceRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestSourceRecord" ADD CONSTRAINT "RequestSourceRecord_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestSourceRecord" ADD CONSTRAINT "RequestSourceRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestSourceRecord" ADD CONSTRAINT "RequestSourceRecord_contextItemId_fkey" FOREIGN KEY ("contextItemId") REFERENCES "ContextItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestSourceRecord" ADD CONSTRAINT "RequestSourceRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanningRequest" ADD CONSTRAINT "PlanningRequest_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "RequestSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_request_source_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Initiative" i JOIN "Project" p ON p.id = i."projectId"
    WHERE i.id = NEW."initiativeId" AND i."projectId" = NEW."projectId"
      AND i."organizationId" = NEW."organizationId" AND p."organizationId" = NEW."organizationId"
  ) THEN RAISE EXCEPTION 'Request source tenant parent mismatch'; END IF;
  IF NEW."documentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Document" d WHERE d.id = NEW."documentId" AND d."initiativeId" = NEW."initiativeId"
      AND d."projectId" = NEW."projectId" AND d."organizationId" = NEW."organizationId"
  ) THEN RAISE EXCEPTION 'Request source document mismatch'; END IF;
  IF NEW."contextItemId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ContextItem" c WHERE c.id = NEW."contextItemId" AND c."documentId" = NEW."documentId"
      AND c."initiativeId" = NEW."initiativeId" AND c."organizationId" = NEW."organizationId" AND c.status = 'approved'
  ) THEN RAISE EXCEPTION 'Request source finding mismatch or unapproved'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER request_source_parent BEFORE INSERT OR UPDATE ON "RequestSourceRecord"
FOR EACH ROW EXECUTE FUNCTION validate_request_source_parent();

ALTER TABLE "RequestSourceRecord" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "RequestSourceRecord" FROM anon, authenticated;
GRANT SELECT, INSERT ON "RequestSourceRecord" TO app_rw;
CREATE POLICY request_source_record_select ON "RequestSourceRecord" FOR SELECT TO app_rw
  USING (is_org_member("organizationId"));
CREATE POLICY request_source_record_insert ON "RequestSourceRecord" FOR INSERT TO app_rw
  WITH CHECK (is_org_member("organizationId"));
