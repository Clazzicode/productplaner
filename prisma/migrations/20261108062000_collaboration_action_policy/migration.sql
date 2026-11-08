-- The database uses the same action matrix as src/lib/access/actions.ts.
-- No memberships or grants are rewritten by this migration.
CREATE FUNCTION app_private.can_initiative_action(p_initiative text, p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH actor AS (
    SELECT u.id, u."memberType", m.role, i.id AS initiative_id
    FROM public."User" u
    JOIN public."OrganizationMember" m ON m."authUserId"=u."authUserId" AND m.status='active'
    JOIN public."Initiative" i ON i."organizationId"=m."organizationId"
    WHERE u."authUserId"=auth.uid() AND u.status='active' AND i.id=p_initiative
  ), authority AS (
    SELECT a.*, (a."memberType"='internal' AND a.role IN ('owner','admin')) AS admin,
      COALESCE((SELECT max(CASE g.permission WHEN 'owner' THEN 3 WHEN 'edit' THEN 2 WHEN 'view' THEN 1 ELSE 0 END)
        FROM public."InitiativeAccess" g
        WHERE g."initiativeId"=a.initiative_id AND (g."userId"=a.id OR EXISTS (
          SELECT 1 FROM public."TeamMember" tm JOIN public."Team" t ON t.id=tm."teamId"
          JOIN public."Initiative" i ON i.id=a.initiative_id AND i."organizationId"=t."organizationId"
          WHERE tm."userId"=a.id AND tm."teamId"=g."teamId"))),0) AS rank
    FROM actor a
  ) SELECT COALESCE(bool_or(CASE
    WHEN p_action IN ('read','submit_feedback') THEN admin OR rank>=1
    WHEN p_action IN ('edit','triage_feedback','accept_story') THEN "memberType"='internal' AND (admin OR rank>=2)
    WHEN p_action IN ('approve_plan','approve_release','publish','manage_integrations','approve_jira_export') THEN admin
    ELSE false END),false) FROM authority;
$$;
REVOKE ALL ON FUNCTION app_private.can_initiative_action(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_initiative_action(text,text) TO app_rw,authenticated;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public."OrganizationMember" m JOIN public."User" u ON u."authUserId"=m."authUserId"
    WHERE m."organizationId"=org_id AND m."authUserId"=auth.uid() AND m.status='active'
    AND u.status='active' AND u."memberType"='internal' AND m.role IN ('owner','admin'));
$$;
CREATE OR REPLACE FUNCTION public.is_org_owner(org_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public."OrganizationMember" m JOIN public."User" u ON u."authUserId"=m."authUserId"
    WHERE m."organizationId"=org_id AND m."authUserId"=auth.uid() AND m.status='active'
    AND u.status='active' AND u."memberType"='internal' AND m.role='owner');
$$;

-- Restrictive policies intersect existing tenant policies; they never broaden access.
CREATE POLICY scoring_action_read ON public."PlanningWeightOverride" AS RESTRICTIVE FOR SELECT TO app_rw,authenticated
  USING (app_private.can_initiative_action("initiativeId",'read'));
CREATE POLICY scoring_action_insert ON public."PlanningWeightOverride" AS RESTRICTIVE FOR INSERT TO app_rw,authenticated
  WITH CHECK (app_private.can_initiative_action("initiativeId",'edit'));
CREATE POLICY scoring_action_update ON public."PlanningWeightOverride" AS RESTRICTIVE FOR UPDATE TO app_rw,authenticated
  USING (app_private.can_initiative_action("initiativeId",'edit')) WITH CHECK (app_private.can_initiative_action("initiativeId",'edit'));
CREATE POLICY scoring_action_delete ON public."PlanningWeightOverride" AS RESTRICTIVE FOR DELETE TO app_rw,authenticated
  USING (app_private.can_initiative_action("initiativeId",'edit'));

CREATE POLICY plan_approval_action ON public."PlanApproval" AS RESTRICTIVE FOR INSERT TO app_rw
  WITH CHECK (app_private.can_initiative_action("initiativeId",'approve_plan'));

CREATE POLICY feedback_action_read ON public."FeedbackRecord" AS RESTRICTIVE FOR SELECT TO app_rw
  USING (app_private.can_initiative_action("initiativeId",'triage_feedback') OR
    (app_private.can_initiative_action("initiativeId",'submit_feedback') AND "createdByUserId"=public.current_app_user_id() AND status='captured'));
CREATE POLICY feedback_action_insert ON public."FeedbackRecord" AS RESTRICTIVE FOR INSERT TO app_rw
  WITH CHECK (app_private.can_initiative_action("initiativeId",'submit_feedback')
    AND "createdByUserId"=public.current_app_user_id() AND status='captured' AND summary='' AND revision=1
    AND (app_private.can_initiative_action("initiativeId",'triage_feedback') OR
      (source='stakeholder' AND "sourceReference"='submission:'||public.current_app_user_id() AND category='general')));
CREATE POLICY feedback_action_update ON public."FeedbackRecord" AS RESTRICTIVE FOR UPDATE TO app_rw
  USING (app_private.can_initiative_action("initiativeId",'triage_feedback'))
  WITH CHECK (app_private.can_initiative_action("initiativeId",'triage_feedback'));

CREATE POLICY feedback_revision_action_read ON public."FeedbackRevision" AS RESTRICTIVE FOR SELECT TO app_rw
  USING (EXISTS (SELECT 1 FROM public."FeedbackRecord" f WHERE f.id="feedbackId" AND app_private.can_initiative_action(f."initiativeId",'triage_feedback')));
CREATE POLICY feedback_revision_action_insert ON public."FeedbackRevision" AS RESTRICTIVE FOR INSERT TO app_rw
  WITH CHECK ("actorUserId"=public.current_app_user_id() AND EXISTS (
    SELECT 1 FROM public."FeedbackRecord" f WHERE f.id="feedbackId" AND
      (app_private.can_initiative_action(f."initiativeId",'triage_feedback') OR
      (app_private.can_initiative_action(f."initiativeId",'submit_feedback') AND f."createdByUserId"=public.current_app_user_id()
        AND f.status='captured' AND "fromRevision"=0 AND "toRevision"=1))));

DO $$ DECLARE child text; BEGIN
  FOREACH child IN ARRAY ARRAY['FeedbackFollowUp','ReprioritizationProposal','FeedbackAiSuggestion'] LOOP
    EXECUTE format('CREATE POLICY feedback_child_action ON public.%I AS RESTRICTIVE FOR ALL TO app_rw
      USING (EXISTS (SELECT 1 FROM public."FeedbackRecord" f WHERE f.id="feedbackId" AND app_private.can_initiative_action(f."initiativeId",''triage_feedback'')))
      WITH CHECK (EXISTS (SELECT 1 FROM public."FeedbackRecord" f WHERE f.id="feedbackId" AND app_private.can_initiative_action(f."initiativeId",''triage_feedback'')))',child);
  END LOOP;
END $$;

-- Core planning and commitment mutations also enforce the matrix under RLS.
-- Parent reads still intersect their existing tenant policies.
DO $$ DECLARE item record; read_check text; write_check text; BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('IntakeAnswerSet','app_private.can_initiative_action("initiativeId",%L)'),
    ('Prototype','app_private.can_initiative_action("initiativeId",%L)'),
    ('PlanningRequest','app_private.can_initiative_action("initiativeId",%L)'),
    ('PriorityDecision','app_private.can_initiative_action("initiativeId",%L)'),
    ('BugPlanningRecord','app_private.can_initiative_action("initiativeId",%L)'),
    ('RefinementSession','app_private.can_initiative_action("initiativeId",%L)'),
    ('RefinementFinding','app_private.can_initiative_action("initiativeId",%L)'),
    ('WorkDependency','app_private.can_initiative_action("initiativeId",%L)'),
    ('PlanningBlocker','app_private.can_initiative_action("initiativeId",%L)'),
    ('SprintReadinessAssessment','app_private.can_initiative_action("initiativeId",%L)'),
    ('SprintPlan','app_private.can_initiative_action("initiativeId",%L)'),
    ('InSprintClarification','app_private.can_initiative_action("initiativeId",%L)'),
    ('DemoItem','app_private.can_initiative_action("initiativeId",%L)'),
    ('PlanningMeeting','app_private.can_initiative_action("initiativeId",%L)'),
    ('SprintReview','app_private.can_initiative_action("initiativeId",%L)'),
    ('ProductValidation','app_private.can_initiative_action("initiativeId",%L)'),
    ('ReleaseReadinessAssessment','app_private.can_initiative_action("initiativeId",%L)'),
    ('RoadmapVersion','app_private.can_initiative_action("initiativeId",%L)'),
    ('Capability','EXISTS (SELECT 1 FROM public."IntakeAnswerSet" parent WHERE parent.id="intakeAnswerSetId" AND app_private.can_initiative_action(parent."initiativeId",%L))'),
    ('ArtifactLayer','EXISTS (SELECT 1 FROM public."Prototype" parent WHERE parent.id="prototypeId" AND app_private.can_initiative_action(parent."initiativeId",%L))'),
    ('LayerLock','EXISTS (SELECT 1 FROM public."Prototype" parent WHERE parent.id="prototypeId" AND app_private.can_initiative_action(parent."initiativeId",%L))'),
    ('Sprint','EXISTS (SELECT 1 FROM public."Prototype" parent WHERE parent.id="prototypeId" AND app_private.can_initiative_action(parent."initiativeId",%L))'),
    ('Release','EXISTS (SELECT 1 FROM public."Prototype" parent WHERE parent.id="prototypeId" AND app_private.can_initiative_action(parent."initiativeId",%L))')
  ) AS policies(table_name, check_template) LOOP
    read_check := format(item.check_template,'read'); write_check := format(item.check_template,'edit');
    EXECUTE format('CREATE POLICY collaboration_read ON public.%I AS RESTRICTIVE FOR SELECT TO app_rw,authenticated USING (%s)',item.table_name,read_check);
    EXECUTE format('CREATE POLICY collaboration_insert ON public.%I AS RESTRICTIVE FOR INSERT TO app_rw,authenticated WITH CHECK (%s)',item.table_name,write_check);
    EXECUTE format('CREATE POLICY collaboration_update ON public.%I AS RESTRICTIVE FOR UPDATE TO app_rw,authenticated USING (%s) WITH CHECK (%s)',item.table_name,write_check,write_check);
    EXECUTE format('CREATE POLICY collaboration_delete ON public.%I AS RESTRICTIVE FOR DELETE TO app_rw,authenticated USING (%s)',item.table_name,write_check);
  END LOOP;
END $$;

CREATE POLICY initiative_action_update ON public."Initiative" AS RESTRICTIVE FOR UPDATE TO app_rw,authenticated
  USING (app_private.can_initiative_action(id,'edit')) WITH CHECK (app_private.can_initiative_action(id,'edit'));
CREATE POLICY initiative_action_delete ON public."Initiative" AS RESTRICTIVE FOR DELETE TO app_rw,authenticated
  USING (app_private.can_initiative_action(id,'edit'));
CREATE POLICY initiative_action_read ON public."Initiative" AS RESTRICTIVE FOR SELECT TO app_rw,authenticated
  USING (app_private.can_initiative_action(id,'read'));
CREATE POLICY release_final_insert ON public."ReleaseReadinessAssessment" AS RESTRICTIVE FOR INSERT TO app_rw
  WITH CHECK (status<>'approved' OR app_private.can_initiative_action("initiativeId",'approve_release'));

-- Shared project context affects multiple initiative access boundaries. Its
-- administration stays with internal workspace admins; initiative-only context
-- follows the linked initiative's edit authority.
DO $$ DECLARE target text; rule text; BEGIN
  FOREACH target IN ARRAY ARRAY['Document','ContextItem','Decision','Risk'] LOOP
    rule := '("initiativeId" IS NULL AND public.is_org_admin("organizationId")) OR ("initiativeId" IS NOT NULL AND app_private.can_initiative_action("initiativeId",''edit''))';
    EXECUTE format('CREATE POLICY context_action_insert ON public.%I AS RESTRICTIVE FOR INSERT TO app_rw,authenticated WITH CHECK (%s)',target,rule);
    EXECUTE format('CREATE POLICY context_action_update ON public.%I AS RESTRICTIVE FOR UPDATE TO app_rw,authenticated USING (%s) WITH CHECK (%s)',target,rule,rule);
    EXECUTE format('CREATE POLICY context_action_delete ON public.%I AS RESTRICTIVE FOR DELETE TO app_rw,authenticated USING (%s)',target,rule);
  END LOOP;
END $$;
CREATE POLICY release_final_update ON public."ReleaseReadinessAssessment" AS RESTRICTIVE FOR UPDATE TO app_rw
  USING (status<>'approved' OR app_private.can_initiative_action("initiativeId",'approve_release'))
  WITH CHECK (status<>'approved' OR app_private.can_initiative_action("initiativeId",'approve_release'));
