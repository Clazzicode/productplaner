ALTER TABLE public."JiraExternalLink"
  ADD COLUMN IF NOT EXISTS "deliveryStatusId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryStatusName" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryStatusCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryMappedStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryPriorityId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryPriorityName" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryLabels" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "deliveryParentKey" TEXT,
  ADD COLUMN IF NOT EXISTS "deliverySourceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveryObservedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveryRevision" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JiraExternalLink_deliveryMappedStatus_check') THEN
    ALTER TABLE public."JiraExternalLink" ADD CONSTRAINT "JiraExternalLink_deliveryMappedStatus_check"
      CHECK ("deliveryMappedStatus" IS NULL OR "deliveryMappedStatus" IN ('planned', 'in_progress', 'done', 'blocked'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JiraExternalLink_deliveryRevision_check') THEN
    ALTER TABLE public."JiraExternalLink" ADD CONSTRAINT "JiraExternalLink_deliveryRevision_check" CHECK ("deliveryRevision" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JiraExternalLink_deliveryLabels_array_check') THEN
    ALTER TABLE public."JiraExternalLink" ADD CONSTRAINT "JiraExternalLink_deliveryLabels_array_check" CHECK (jsonb_typeof("deliveryLabels") = 'array');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "JiraExternalLink_organizationId_initiativeId_deliveryMappedStatus_idx"
  ON public."JiraExternalLink"("organizationId", "initiativeId", "deliveryMappedStatus");
