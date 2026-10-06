-- Release cadence is planning context for an initiative. Existing initiatives
-- remain valid and show "not set" until a Product Owner creates/updates a
-- manual release. No tenant policy changes are needed because no new table or
-- ownership path is introduced.
ALTER TABLE "Initiative"
ADD COLUMN "releaseCadence" TEXT NOT NULL DEFAULT '',
ADD COLUMN "customReleaseCadence" TEXT NOT NULL DEFAULT '';
