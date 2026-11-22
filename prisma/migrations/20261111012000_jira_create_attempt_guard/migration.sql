ALTER TABLE public."JiraExportItem" ADD COLUMN IF NOT EXISTS "createAttemptedAt" TIMESTAMP(3);
ALTER TABLE public."JiraExportItem" ADD COLUMN IF NOT EXISTS "connectionId" TEXT;
UPDATE public."JiraExportItem" AS item SET "connectionId" = run."connectionId" FROM public."JiraExportRun" AS run WHERE item."exportRunId" = run.id AND item."connectionId" IS NULL;
ALTER TABLE public."JiraExportItem" ALTER COLUMN "connectionId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "JiraExportItem_connectionId_targetType_targetId_idx" ON public."JiraExportItem"("connectionId", "targetType", "targetId");
CREATE UNIQUE INDEX IF NOT EXISTS "JiraExportItem_one_create_attempt_per_target" ON public."JiraExportItem"("connectionId", "targetType", "targetId") WHERE action = 'create' AND "createAttemptedAt" IS NOT NULL;
