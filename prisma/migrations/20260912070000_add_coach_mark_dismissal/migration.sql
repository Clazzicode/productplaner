-- Coach marks (directive §4). Purely additive — new, empty table.
-- Hand-written, same reason as the Project-layer migrations (see their own
-- header comments) — `migrate dev`/`migrate diff` both fail before reaching
-- this change because of `platform_admins`'s cross-schema FK into `auth.users`.

-- CreateTable
CREATE TABLE "CoachMarkDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachMarkDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachMarkDismissal_userId_key_key" ON "CoachMarkDismissal"("userId", "key");

-- AddForeignKey
ALTER TABLE "CoachMarkDismissal" ADD CONSTRAINT "CoachMarkDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: personal-only, no organization chain to walk — matches
-- QualifyingProfile's "own rows only" policy shape exactly.
ALTER TABLE "CoachMarkDismissal" ENABLE ROW LEVEL SECURITY;

CREATE POLICY coach_mark_dismissal_all ON "CoachMarkDismissal" FOR ALL TO app_rw, authenticated
  USING ("userId" = current_app_user_id()) WITH CHECK ("userId" = current_app_user_id());
