-- Remove bring-your-own-key (directive §30/§37): every AI call now routes
-- through the shared platform gateway (ANTHROPIC_API_KEY env var). No
-- backfill needed — these columns were only ever read by the deleted
-- src/lib/intakeImport/analyzeDocument.ts, which is superseded by the
-- DOCUMENT_UNDERSTANDING gateway action.
-- Hand-written, same reason as every migration since add_project_layer_step_a.

ALTER TABLE "User" DROP COLUMN "anthropicApiKeyEncrypted";
ALTER TABLE "User" DROP COLUMN "anthropicApiKeyUpdatedAt";
