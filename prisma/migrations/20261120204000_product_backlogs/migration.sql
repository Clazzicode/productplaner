CREATE TABLE "Backlog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Backlog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Backlog_id_projectId_key" ON "Backlog"("id", "projectId");
CREATE INDEX "Backlog_organizationId_projectId_idx" ON "Backlog"("organizationId", "projectId");

ALTER TABLE "Backlog" ADD CONSTRAINT "Backlog_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Backlog" ADD CONSTRAINT "Backlog_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Initiative" ADD COLUMN "backlogId" TEXT;
CREATE INDEX "Initiative_backlogId_idx" ON "Initiative"("backlogId");
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_backlogId_projectId_fkey"
  FOREIGN KEY ("backlogId", "projectId") REFERENCES "Backlog"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Give every existing feature its own backlog. Existing planning records stay
-- attached to the same feature until a person deliberately changes the link.
INSERT INTO "Backlog" ("id", "organizationId", "projectId", "name", "createdAt", "updatedAt")
SELECT 'backlog-' || "id", "organizationId", "projectId", "name" || ' backlog', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Initiative";
UPDATE "Initiative" SET "backlogId" = 'backlog-' || "id" WHERE "backlogId" IS NULL;

GRANT SELECT, INSERT, UPDATE ON "Backlog" TO app_rw;
ALTER TABLE "Backlog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY backlog_select ON "Backlog" FOR SELECT TO app_rw, authenticated
  USING (is_org_member("organizationId"));
CREATE POLICY backlog_insert ON "Backlog" FOR INSERT TO app_rw
  WITH CHECK (is_org_member("organizationId") AND EXISTS (
    SELECT 1 FROM "Project" WHERE "Project"."id" = "Backlog"."projectId"
      AND "Project"."organizationId" = "Backlog"."organizationId"
  ));
CREATE POLICY backlog_update ON "Backlog" FOR UPDATE TO app_rw
  USING (is_org_member("organizationId"))
  WITH CHECK (is_org_member("organizationId") AND EXISTS (
    SELECT 1 FROM "Project" WHERE "Project"."id" = "Backlog"."projectId"
      AND "Project"."organizationId" = "Backlog"."organizationId"
  ));
