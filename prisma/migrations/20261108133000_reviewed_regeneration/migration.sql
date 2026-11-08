ALTER TABLE public."ArtifactLayer" ADD COLUMN "generationKey" text,
  ADD COLUMN "generatedBaseline" jsonb, ADD COLUMN "generationReviewStatus" text;
CREATE UNIQUE INDEX "ArtifactLayer_generationKey_key" ON public."ArtifactLayer" ("prototypeId","generationKey") WHERE "generationKey" IS NOT NULL;

CREATE TABLE public."RegenerationProposal" (
  id text PRIMARY KEY,
  "initiativeId" text NOT NULL REFERENCES public."Initiative"(id) ON DELETE CASCADE,
  "prototypeId" text NOT NULL REFERENCES public."Prototype"(id) ON DELETE CASCADE,
  "createdByUserId" text NOT NULL REFERENCES public."User"(id),
  "sourceFingerprint" text NOT NULL,
  "recordFingerprint" text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied')),
  decisions jsonb, "resultingMapping" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "appliedAt" timestamptz,
  CHECK ((status='pending' AND "appliedAt" IS NULL) OR (status='applied' AND "appliedAt" IS NOT NULL))
);
CREATE INDEX "RegenerationProposal_initiativeId_createdAt_idx" ON public."RegenerationProposal" ("initiativeId","createdAt");
ALTER TABLE public."RegenerationProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RegenerationProposal" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public."RegenerationProposal" FROM app_rw,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public."RegenerationProposal" TO app_rw;
CREATE POLICY proposal_read ON public."RegenerationProposal" FOR SELECT TO app_rw
  USING (app_private.can_initiative_action("initiativeId",'edit'));
CREATE POLICY proposal_create ON public."RegenerationProposal" FOR INSERT TO app_rw
  WITH CHECK (app_private.can_initiative_action("initiativeId",'edit') AND status='pending'
    AND EXISTS (SELECT 1 FROM public."User" u WHERE u.id="createdByUserId" AND u."authUserId"=auth.uid())
    AND EXISTS (SELECT 1 FROM public."Prototype" p WHERE p.id="prototypeId" AND p."initiativeId"="RegenerationProposal"."initiativeId"));
CREATE POLICY proposal_apply ON public."RegenerationProposal" FOR UPDATE TO app_rw
  USING (app_private.can_initiative_action("initiativeId",'edit') AND status='pending')
  WITH CHECK (app_private.can_initiative_action("initiativeId",'edit') AND status='applied');
CREATE FUNCTION app_private.protect_regeneration_proposal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status<>'pending' OR NEW.status<>'applied' OR NEW.id<>OLD.id OR NEW."initiativeId"<>OLD."initiativeId"
    OR NEW."prototypeId"<>OLD."prototypeId" OR NEW."createdByUserId"<>OLD."createdByUserId"
    OR NEW."sourceFingerprint"<>OLD."sourceFingerprint" OR NEW."recordFingerprint"<>OLD."recordFingerprint"
    OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW."createdAt"<>OLD."createdAt" THEN
    RAISE EXCEPTION 'Regeneration proposal evidence is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.protect_regeneration_proposal() FROM PUBLIC;
CREATE TRIGGER regeneration_proposal_evidence BEFORE UPDATE ON public."RegenerationProposal"
  FOR EACH ROW EXECUTE FUNCTION app_private.protect_regeneration_proposal();
