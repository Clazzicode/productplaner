ALTER TABLE public."JiraExternalLink"
  ADD COLUMN "deliveryStatusId" TEXT,
  ADD COLUMN "deliveryStatusName" TEXT,
  ADD COLUMN "deliveryStatusCategory" TEXT,
  ADD COLUMN "deliveryMappedStatus" TEXT,
  ADD COLUMN "deliveryPriorityId" TEXT,
  ADD COLUMN "deliveryPriorityName" TEXT,
  ADD COLUMN "deliveryLabels" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "deliveryParentKey" TEXT,
  ADD COLUMN "deliverySourceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryObservedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public."JiraExternalLink"
  ADD CONSTRAINT "JiraExternalLink_deliveryMappedStatus_check"
  CHECK ("deliveryMappedStatus" IS NULL OR "deliveryMappedStatus" IN ('planned', 'in_progress', 'done', 'blocked')),
  ADD CONSTRAINT "JiraExternalLink_deliveryRevision_check" CHECK ("deliveryRevision" >= 0),
  ADD CONSTRAINT "JiraExternalLink_deliveryLabels_array_check" CHECK (jsonb_typeof("deliveryLabels") = 'array');

CREATE INDEX "JiraExternalLink_organizationId_initiativeId_deliveryMappedStatus_idx"
  ON public."JiraExternalLink"("organizationId", "initiativeId", "deliveryMappedStatus");
