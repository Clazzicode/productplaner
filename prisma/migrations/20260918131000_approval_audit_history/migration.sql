ALTER TABLE "RoadmapVersion" ADD COLUMN "authoredByUserId" TEXT;
ALTER TABLE "RoadmapVersion" ADD CONSTRAINT roadmap_version_status_check CHECK (status IN ('draft','approved','superseded'));

CREATE TABLE "PlanApproval" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"(id),
  "initiativeId" TEXT NOT NULL,
  "projectId" TEXT,
  "planVersionId" TEXT NOT NULL UNIQUE REFERENCES "RoadmapVersion"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'approved' CHECK (status = 'approved'),
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX "PlanApproval_organizationId_initiativeId_approvedAt_idx" ON "PlanApproval"("organizationId", "initiativeId", "approvedAt");
CREATE TABLE "AuditEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"(id),
  "actorUserId" TEXT,
  "projectId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");
ALTER TABLE "PlanApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PlanApproval", "AuditEvent" FROM anon, authenticated, app_rw;
GRANT SELECT, INSERT ON "PlanApproval", "AuditEvent" TO app_rw;
CREATE POLICY approval_select ON "PlanApproval" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY approval_insert ON "PlanApproval" FOR INSERT TO app_rw WITH CHECK (
  is_org_admin("organizationId") AND "approvedBy" = current_app_user_id()
  AND EXISTS (SELECT 1 FROM "RoadmapVersion" v JOIN "Initiative" i ON i.id = v."initiativeId"
    WHERE v.id = "PlanApproval"."planVersionId" AND i.id = "PlanApproval"."initiativeId"
      AND i."organizationId" = "PlanApproval"."organizationId"
      AND i."projectId" IS NOT DISTINCT FROM "PlanApproval"."projectId"
      AND v.status = 'approved' AND v."approvedByUserId" = "PlanApproval"."approvedBy")
);
CREATE POLICY audit_select ON "AuditEvent" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY audit_insert ON "AuditEvent" FOR INSERT TO app_rw WITH CHECK (
  is_org_member("organizationId") AND "actorUserId" = current_app_user_id()
  AND ("projectId" IS NULL OR EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "AuditEvent"."projectId" AND p."organizationId" = "AuditEvent"."organizationId"))
);

CREATE FUNCTION app_private.immutable_history()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'RoadmapVersion' AND TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status')
      AND OLD.status = 'approved' AND NEW.status = 'superseded' THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Planning history is immutable';
END;
$$;
REVOKE ALL ON FUNCTION app_private.immutable_history() FROM PUBLIC;
CREATE TRIGGER immutable_roadmap_history BEFORE UPDATE OR DELETE ON "RoadmapVersion"
  FOR EACH ROW EXECUTE FUNCTION app_private.immutable_history();
CREATE TRIGGER immutable_plan_approval BEFORE UPDATE OR DELETE ON "PlanApproval"
  FOR EACH ROW EXECUTE FUNCTION app_private.immutable_history();
CREATE TRIGGER immutable_audit_event BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION app_private.immutable_history();

-- Backfill only facts already recorded in existing approvals. Unknown authors
-- remain NULL and are explicitly identified as legacy records.
INSERT INTO "PlanApproval" (id,"organizationId","initiativeId","projectId","planVersionId","approvedBy","approvedAt",metadata)
SELECT 'legacy-' || v.id,i."organizationId",i.id,i."projectId",v.id,v."approvedByUserId",v."approvedAt",'{"legacy":true}'::jsonb
FROM "RoadmapVersion" v JOIN "Initiative" i ON i.id=v."initiativeId"
WHERE v."approvedAt" IS NOT NULL;
