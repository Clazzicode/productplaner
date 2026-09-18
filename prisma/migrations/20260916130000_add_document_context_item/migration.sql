-- Document Import & Approved Context foundation. Purely additive: two new
-- tables, no changes to existing ones. Hand-written, same reason as every
-- migration since add_project_layer_step_a (prisma migrate dev/diff both
-- fail on platform_admins's cross-schema FK to auth.users).

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "initiativeId" TEXT,
    "scope" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileExt" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "processingError" TEXT,
    "extractedChunksJson" TEXT,
    "supersedesDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Document_projectId_idx" ON "Document"("projectId");
CREATE INDEX "Document_initiativeId_idx" ON "Document"("initiativeId");

-- CreateTable
CREATE TABLE "ContextItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "initiativeId" TEXT,
    "documentId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "sourceExcerpt" TEXT NOT NULL,
    "sourceChunkIndex" INTEGER,
    "sourceHeading" TEXT,
    "sourcePageNumber" INTEGER,
    "sourceSlideNumber" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'extracted',
    "conflictWithItemId" TEXT,
    "conflictsWithExistingValueText" TEXT,
    "approvedValueText" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContextItem_projectId_initiativeId_fieldKey_idx" ON "ContextItem"("projectId", "initiativeId", "fieldKey");
CREATE INDEX "ContextItem_documentId_idx" ON "ContextItem"("documentId");

-- AddForeignKey (mirrors Risk/Decision's exact onDelete conventions)
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_supersedesDocumentId_fkey" FOREIGN KEY ("supersedesDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContextItem" ADD CONSTRAINT "ContextItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContextItem" ADD CONSTRAINT "ContextItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextItem" ADD CONSTRAINT "ContextItem_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextItem" ADD CONSTRAINT "ContextItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextItem" ADD CONSTRAINT "ContextItem_conflictWithItemId_fkey" FOREIGN KEY ("conflictWithItemId") REFERENCES "ContextItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContextItem" ADD CONSTRAINT "ContextItem_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: direct organizationId check, matching Decision/Risk/Project exactly
-- (verified in prisma/migrations/20260912060000_add_project_layer_step_a/migration.sql)
-- — not a join through Project, since both tables carry their own
-- organizationId column. Tenant-boundary enforcement is all RLS needs to do
-- here; projectId/initiativeId internal consistency is an app-layer check,
-- same as the existing Risk creation route already does.
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_all ON "Document" FOR ALL TO app_rw, authenticated
  USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));

ALTER TABLE "ContextItem" ENABLE ROW LEVEL SECURITY;

CREATE POLICY context_item_all ON "ContextItem" FOR ALL TO app_rw, authenticated
  USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
