-- Inventory found no current violations. Never rewrite ambiguous identities.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public."ArtifactLayer" a JOIN public."Prototype" p ON p.id=a."prototypeId"
    JOIN public."Capability" c ON c.id=a."sourceCapabilityId" JOIN public."IntakeAnswerSet" i ON i.id=c."intakeAnswerSetId"
    WHERE p."initiativeId"<>i."initiativeId") THEN RAISE EXCEPTION 'Review artifact feature scope before migrating'; END IF;
  IF EXISTS (SELECT 1 FROM public."ArtifactLayer" WHERE type='feature' AND "archivedAt" IS NULL AND "sourceCapabilityId" IS NOT NULL
    GROUP BY "prototypeId","sourceCapabilityId" HAVING count(*)>1) THEN RAISE EXCEPTION 'Review duplicate active feature representations before migrating'; END IF;
  IF EXISTS (SELECT 1 FROM public."ArtifactLayer" a JOIN public."ArtifactLayer" p ON p.id=a."parentId"
    WHERE a.type IN ('epic','story','acceptance_criterion') AND a."sourceCapabilityId" IS NOT NULL
    AND p."sourceCapabilityId" IS NOT NULL AND a."sourceCapabilityId"<>p."sourceCapabilityId") THEN
    RAISE EXCEPTION 'Review artifact hierarchy feature identities before migrating';
  END IF;
END $$;

CREATE UNIQUE INDEX "ArtifactLayer_active_feature_capability_key" ON public."ArtifactLayer" ("prototypeId","sourceCapabilityId")
  WHERE type='feature' AND "archivedAt" IS NULL AND "sourceCapabilityId" IS NOT NULL;
CREATE INDEX "ArtifactLayer_sourceCapabilityId_idx" ON public."ArtifactLayer" ("sourceCapabilityId");

CREATE FUNCTION app_private.validate_artifact_feature_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row_data public."ArtifactLayer"%ROWTYPE;
BEGIN
  -- Read the final row: moves may update parent and children in one transaction.
  SELECT * INTO row_data FROM public."ArtifactLayer" WHERE id=NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF row_data."sourceCapabilityId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."Capability" c JOIN public."IntakeAnswerSet" i ON i.id=c."intakeAnswerSetId"
    JOIN public."Prototype" p ON p."initiativeId"=i."initiativeId"
    WHERE c.id=row_data."sourceCapabilityId" AND p.id=row_data."prototypeId"
  ) THEN RAISE EXCEPTION 'Artifact feature belongs to a different initiative' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM public."ArtifactLayer" parent WHERE parent.id=row_data."parentId"
    AND row_data.type IN ('epic','story','acceptance_criterion') AND row_data."sourceCapabilityId" IS NOT NULL
    AND parent."sourceCapabilityId" IS NOT NULL AND row_data."sourceCapabilityId"<>parent."sourceCapabilityId")
    OR EXISTS (SELECT 1 FROM public."ArtifactLayer" child WHERE child."parentId"=row_data.id
      AND child.type IN ('epic','story','acceptance_criterion') AND child."sourceCapabilityId" IS NOT NULL
      AND row_data."sourceCapabilityId" IS NOT NULL AND child."sourceCapabilityId"<>row_data."sourceCapabilityId")
    THEN RAISE EXCEPTION 'Artifact hierarchy has inconsistent feature identity' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app_private.validate_artifact_feature_identity() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER artifact_feature_identity AFTER INSERT OR UPDATE ON public."ArtifactLayer"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.validate_artifact_feature_identity();

CREATE FUNCTION app_private.preserve_planning_containment()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='Capability' THEN
    IF NEW."intakeAnswerSetId"<>OLD."intakeAnswerSetId" THEN RAISE EXCEPTION 'Canonical feature containment cannot change' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME IN ('Prototype','IntakeAnswerSet') THEN
    IF NEW."initiativeId"<>OLD."initiativeId" THEN RAISE EXCEPTION 'Planning container initiative cannot change' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.preserve_planning_containment() FROM PUBLIC;
CREATE TRIGGER canonical_feature_containment BEFORE UPDATE OF "intakeAnswerSetId" ON public."Capability" FOR EACH ROW EXECUTE FUNCTION app_private.preserve_planning_containment();
CREATE TRIGGER prototype_containment BEFORE UPDATE OF "initiativeId" ON public."Prototype" FOR EACH ROW EXECUTE FUNCTION app_private.preserve_planning_containment();
CREATE TRIGGER intake_containment BEFORE UPDATE OF "initiativeId" ON public."IntakeAnswerSet" FOR EACH ROW EXECUTE FUNCTION app_private.preserve_planning_containment();
