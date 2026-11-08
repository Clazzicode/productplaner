-- A preview is never an approval. Import and export selections are recorded
-- only when an administrator explicitly chooses items and submits a reason.
ALTER TABLE public."JiraImportItem" ALTER COLUMN "selected" SET DEFAULT false;
ALTER TABLE public."JiraExportItem" ALTER COLUMN "selected" SET DEFAULT false;

UPDATE public."JiraImportItem" AS item
SET "selected" = false
FROM public."JiraImportRun" AS run
WHERE item."importRunId" = run.id
  AND run.status = 'previewed'
  AND item.status = 'previewed'
  AND item."selected" = true;

UPDATE public."JiraExportItem" AS item
SET "selected" = false
FROM public."JiraExportRun" AS run
WHERE item."exportRunId" = run.id
  AND run.status = 'previewed'
  AND item.status = 'previewed'
  AND item."selected" = true;
