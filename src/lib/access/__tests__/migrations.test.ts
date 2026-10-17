import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pg = new PGlite();
const authA = "00000000-0000-0000-0000-000000000001";
const authB = "00000000-0000-0000-0000-000000000002";

beforeAll(async () => {
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
    $$;`);
  const root = path.resolve("prisma/migrations");
  for (const folder of (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
    try { await pg.exec(await readFile(path.join(root, folder.name, "migration.sql"), "utf8")); }
    catch (error) { throw new Error(`Migration failed: ${folder.name}`, { cause: error }); }
  }
}, 60_000);
afterAll(async () => { await pg.close(); });

async function asUser<T>(authId: string, fn: () => Promise<T>): Promise<T> {
  await pg.exec("BEGIN; SET LOCAL ROLE app_rw;");
  try {
    await pg.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: authId, role: "authenticated" })]);
    const result = await fn();
    await pg.exec("COMMIT");
    return result;
  } catch (error) { await pg.exec("ROLLBACK"); throw error; }
}

async function bootstrap(id: string, authId: string) {
  return asUser(authId, async () => {
    await pg.query('INSERT INTO "Organization" (id,name) VALUES ($1,$1) RETURNING id', [id]);
    await pg.query('INSERT INTO "User" (id,"organizationId","authUserId",name,email) VALUES ($1,$2,$3,$1,$1)', [`user-${id}`,id,authId]);
    await pg.query('INSERT INTO "OrganizationMember" (id,"organizationId","authUserId",role,"updatedAt") VALUES ($1,$2,$3,\'owner\',now()) RETURNING id', [`member-${id}`,id,authId]);
    await pg.query('UPDATE "Organization" SET "ownerUserId"=$1 WHERE id=$2', [`user-${id}`,id]);
  });
}

describe.sequential("migration replay and real PostgreSQL RLS", () => {
  it("replays all migrations and preserves atomic signup under app_rw", async () => {
    await bootstrap("org-a",authA);
    await bootstrap("org-b",authB);
    for (const suffix of ["a", "b"]) {
      await pg.exec(`INSERT INTO "Project" (id,"organizationId","createdByUserId",name,"updatedAt") VALUES ('project-${suffix}','org-${suffix}','user-org-${suffix}','Project',now());
        INSERT INTO "Initiative" (id,"organizationId","userId",name,"projectId","updatedAt") VALUES ('init-${suffix}','org-${suffix}','user-org-${suffix}','Initiative','project-${suffix}',now());
        INSERT INTO "Prototype" (id,"initiativeId","updatedAt") VALUES ('proto-${suffix}','init-${suffix}',now());
        INSERT INTO "ArtifactLayer" (id,"prototypeId",type,"order",title,body,"updatedAt") VALUES ('artifact-${suffix}','proto-${suffix}','roadmap',0,'Original','Original',now());`);
    }
  });
  it("blocks arbitrary self-enrollment with a known organization ID", async () => {
    await expect(asUser(authA, () => pg.query('INSERT INTO "OrganizationMember" (id,"organizationId","authUserId",role,"updatedAt") VALUES (\'attack\',\'org-b\',$1,\'owner\',now())', [authA]))).rejects.toThrow();
  });
  it("hides another organization's exact ID", async () => {
    const result = await asUser(authA, () => pg.query('SELECT id FROM "Organization" WHERE id=\'org-b\''));
    expect(result.rows).toEqual([]);
  });
  it("prevents membership identity reassignment", async () => {
    await expect(asUser(authA, () => pg.exec('UPDATE "OrganizationMember" SET "organizationId"=\'org-b\' WHERE id=\'member-org-a\''))).rejects.toThrow();
  });
  it("preserves the active owner role", async () => {
    await expect(asUser(authA, () => pg.exec('UPDATE "OrganizationMember" SET role=\'admin\' WHERE id=\'member-org-a\''))).rejects.toThrow();
  });
  it("prevents identity reassignment through a self-update", async () => {
    await expect(asUser(authA, () => pg.exec('UPDATE "User" SET "organizationId"=\'org-b\' WHERE id=\'user-org-a\''))).rejects.toThrow();
  });
  it("blocks direct Data API table access that bypasses application guards", async () => {
    await pg.exec("BEGIN; SET LOCAL ROLE authenticated");
    try { await expect(pg.exec('SELECT * FROM "Organization"')).rejects.toThrow(); }
    finally { await pg.exec("ROLLBACK"); }
  });
  it("rejects cross-tenant project linkage even with the attacker's own organizationId", async () => {
    await expect(asUser(authA, () => pg.exec(`INSERT INTO "Initiative" (id,"organizationId","userId",name,"projectId","updatedAt") VALUES ('bad-init','org-a','user-org-a','Bad','project-b',now())`))).rejects.toThrow();
  });
  it("does not mutate a foreign artifact by exact ID", async () => {
    const result = await asUser(authA, () => pg.query(`UPDATE "ArtifactLayer" SET title='Hacked' WHERE id='artifact-b' RETURNING id`));
    expect(result.rows).toEqual([]);
  });
  it("isolates acceptance-criteria history and enforces story-source invariants", async () => {
    await asUser(authA, () => pg.exec(`
      INSERT INTO "ArtifactLayer" (id,"prototypeId",type,"parentId","order",title,body,"sourceType","externalRef","dedupeKey","updatedAt")
      VALUES ('story-a','proto-a','story','artifact-a',1,'Story','As a user, I want a result, so that I get value.','jira','GP-8','feature:artifact-a:title:story',now());
      INSERT INTO "ArtifactLayer" (id,"prototypeId",type,"parentId","order",title,body,"sourceType","approvedAt","updatedAt")
      VALUES ('criterion-a','proto-a','acceptance_criterion','story-a',0,'Works','Given context, when action, then outcome.','manual',now(),now());
      INSERT INTO "ArtifactRevision" (id,"artifactId",version,title,body,reason)
      VALUES ('revision-a','criterion-a',1,'Works','Given context, when action, then outcome.','Approved');
      INSERT INTO "RefinementFinding" (id,"organizationId","initiativeId","storyId","sourceType",category,title,detail,"createdByUserId","updatedAt")
      VALUES ('finding-a','org-a','init-a','story-a','manual','engineering_question','Clarify failure behavior','What happens when the provider is unavailable?','user-org-a',now());
    `));
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "ArtifactRevision" WHERE id='revision-a'`))).rows).toEqual([]);
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "RefinementFinding" WHERE id='finding-a'`))).rows).toEqual([]);
    await asUser(authB, () => pg.exec(`UPDATE "RefinementFinding" SET title='Hacked' WHERE id='finding-a'`));
    expect((await pg.query<{ title: string }>(`SELECT title FROM "RefinementFinding" WHERE id='finding-a'`)).rows[0].title).toBe("Clarify failure behavior");
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "ArtifactLayer" (id,"prototypeId",type,"order",title,body,"sourceType","updatedAt")
      VALUES ('bad-jira','proto-a','story',2,'Missing key','Body','jira',now())
    `))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "ArtifactLayer" (id,"prototypeId",type,"order",title,body,"sourceType","externalRef","dedupeKey","updatedAt")
      VALUES ('duplicate-story','proto-a','story',3,'Duplicate','Body','jira','GP-9','feature:artifact-a:title:story',now())
    `))).rejects.toThrow();
  });
  it("rolls back a planning mutation when a required downstream write fails", async () => {
    await expect(asUser(authA, async () => {
      await pg.exec(`UPDATE "ArtifactLayer" SET title='Moved' WHERE id='artifact-a'`);
      await pg.exec(`INSERT INTO "AuditEvent" (id,"organizationId","actorUserId","entityType","entityId",action) VALUES ('bad-audit','org-b','user-org-a','initiative','init-a','moved')`);
    })).rejects.toThrow();
    expect((await pg.query<{ title: string }>(`SELECT title FROM "ArtifactLayer" WHERE id='artifact-a'`)).rows[0].title).toBe("Original");
  });
  it("writes an approval and audit, then forbids mutation of the history", async () => {
    await asUser(authA, () => pg.exec(`
      INSERT INTO "RoadmapVersion" (id,"initiativeId","versionNumber",status,"snapshotJson","approvedAt","approvedByUserId") VALUES ('version-a','init-a',1,'approved','{}',now(),'user-org-a');
      INSERT INTO "PlanApproval" (id,"organizationId","initiativeId","projectId","planVersionId","approvedBy") VALUES ('approval-a','org-a','init-a','project-a','version-a','user-org-a');
      INSERT INTO "AuditEvent" (id,"organizationId","actorUserId","projectId","entityType","entityId",action) VALUES ('audit-a','org-a','user-org-a','project-a','initiative','init-a','plan.approved');
    `));
    await expect(asUser(authA, () => pg.exec(`UPDATE "RoadmapVersion" SET "snapshotJson"='{"changed":true}' WHERE id='version-a'`))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`DELETE FROM "PlanApproval" WHERE id='approval-a'`))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`UPDATE "AuditEvent" SET action='forged' WHERE id='audit-a'`))).rejects.toThrow();
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "PlanApproval" WHERE id='approval-a'`))).rows).toEqual([]);
  });
  it("rolls back lock creation when approval persistence fails", async () => {
    await expect(asUser(authA, async () => {
      await pg.exec(`INSERT INTO "LayerLock" (id,"prototypeId","layerType",sequence,state) VALUES ('lock-a','proto-a','roadmap',1,'locked')`);
      await pg.exec(`INSERT INTO "PlanApproval" (id,"organizationId","initiativeId","planVersionId","approvedBy") VALUES ('invalid','org-a','init-a','missing-version','user-org-a')`);
    })).rejects.toThrow();
    expect((await pg.query(`SELECT id FROM "LayerLock" WHERE id='lock-a'`)).rows).toEqual([]);
  });
  it("isolates PO requests and prevents moving them between initiatives", async () => {
    await asUser(authA, () => pg.exec(`INSERT INTO "PlanningRequest" (id,"initiativeId",data,"updatedAt") VALUES ('request-a','init-a','{}',now())`));
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "PlanningRequest" WHERE id='request-a'`))).rows).toEqual([]);
    expect((await asUser(authB, () => pg.query(`UPDATE "PlanningRequest" SET data='{"title":"attack"}' WHERE id='request-a' RETURNING id`))).rows).toEqual([]);
    await expect(asUser(authA, () => pg.exec(`INSERT INTO "PlanningRequest" (id,"initiativeId",data,"updatedAt") VALUES ('request-bad','init-b','{}',now())`))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`UPDATE "PlanningRequest" SET "initiativeId"='init-b' WHERE id='request-a'`))).rejects.toThrow();
  });
  it("isolates immutable requirement history and validates its tenant parent", async () => {
    await asUser(authA, () => pg.exec(`
      INSERT INTO "RequestRevision" (id,"organizationId","requestId","fromRevision","toRevision","nextData",reason,"changedByUserId")
      VALUES ('request-revision-a','org-a','request-a',0,1,'{}','Request created','user-org-a')
    `));
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "RequestRevision" WHERE id='request-revision-a'`))).rows).toEqual([]);
    expect((await asUser(authA, () => pg.query(`UPDATE "RequestRevision" SET reason='Forged' WHERE id='request-revision-a' RETURNING id`))).rows).toEqual([]);
    expect((await asUser(authA, () => pg.query(`DELETE FROM "RequestRevision" WHERE id='request-revision-a' RETURNING id`))).rows).toEqual([]);
    expect((await asUser(authA, () => pg.query<{ reason: string }>(`SELECT reason FROM "RequestRevision" WHERE id='request-revision-a'`))).rows[0].reason).toBe("Request created");
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "RequestRevision" (id,"organizationId","requestId","fromRevision","toRevision","nextData",reason)
      VALUES ('request-revision-bad','org-b','request-a',1,2,'{}','Wrong tenant')
    `))).rejects.toThrow();
  });
  it("does not expose PO requests directly to the browser Data API", async () => {
    await pg.exec("BEGIN; SET LOCAL ROLE authenticated");
    try { await expect(pg.exec('SELECT * FROM "PlanningRequest"')).rejects.toThrow(); }
    finally { await pg.exec("ROLLBACK"); }
  });
  it("keeps backlog metadata tenant-scoped and enforces one PO key per initiative", async () => {
    await pg.exec(`INSERT INTO "IntakeAnswerSet" (id,"initiativeId","updatedAt") VALUES ('intake-a','init-a',now()),('intake-b','init-b',now());
      INSERT INTO "Capability" (id,"intakeAnswerSetId",name,"isMvp","effortSize","businessValue","backlogKey") VALUES ('cap-a','intake-a','A',false,'m','medium','PO-01');`);
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "Capability" WHERE id='cap-a'`))).rows).toEqual([]);
    expect((await asUser(authB, () => pg.query(`UPDATE "Capability" SET "backlogLane"='now' WHERE id='cap-a' RETURNING id`))).rows).toEqual([]);
    await expect(asUser(authA, () => pg.exec(`INSERT INTO "Capability" (id,"intakeAnswerSetId",name,"isMvp","effortSize","businessValue","backlogKey") VALUES ('cap-a-duplicate','intake-a','Duplicate',false,'m','medium','PO-01')`))).rejects.toThrow();
  });

  it("enforces PO workflow targets, dependency uniqueness, and tenant isolation", async () => {
    await asUser(authA, () => pg.exec(`
      INSERT INTO "ArtifactLayer" (id,"prototypeId",type,"order",title,body,"updatedAt")
      VALUES ('story-a2','proto-a','story',2,'Second story','As a planner, I need a second result, so that dependencies can be tested.',now());
      INSERT INTO "WorkDependency" (id,"organizationId","initiativeId","predecessorStoryId","dependentStoryId","createdByUserId")
      VALUES ('dependency-a','org-a','init-a','story-a','story-a2','user-org-a');
      INSERT INTO "PlanningBlocker" (id,"organizationId","initiativeId","blockerType",description,"storyId","createdByUserId","updatedAt")
      VALUES ('blocker-a','org-a','init-a','dependency','Waiting for an external decision','story-a2','user-org-a',now());
    `));
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "WorkDependency" (id,"organizationId","initiativeId","predecessorStoryId","dependentStoryId","createdByUserId")
      VALUES ('dependency-duplicate','org-a','init-a','story-a','story-a2','user-org-a')
    `))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "PlanningBlocker" (id,"organizationId","initiativeId","blockerType",description,"storyId","createdByUserId","updatedAt")
      VALUES ('blocker-cross','org-a','init-a','dependency','Wrong initiative','artifact-b','user-org-a',now())
    `))).rejects.toThrow();
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "PlanningBlocker" WHERE id='blocker-a'`))).rows).toEqual([]);
  });

  it("keeps refinement, readiness, and sprint-plan targets inside one initiative", async () => {
    await asUser(authA, () => pg.exec(`
      INSERT INTO "RefinementSession" (id,"organizationId","projectId","initiativeId",title,"createdByUserId","updatedAt")
      VALUES ('session-a','org-a','project-a','init-a','Refinement','user-org-a',now());
      INSERT INTO "RefinementSessionItem" (id,"sessionId","storyId","updatedAt") VALUES ('session-item-a','session-a','story-a',now());
      INSERT INTO "SprintReadinessAssessment" (id,"organizationId","initiativeId","storyId","inputFingerprint",decision,reason,"decidedByUserId")
      VALUES ('readiness-a','org-a','init-a','story-a',repeat('a',64),'ready','All checks passed','user-org-a');
      INSERT INTO "Sprint" (id,"prototypeId","sprintNumber","phaseNumber","startDate","endDate","capacityPoints")
      VALUES ('sprint-a','proto-a',1,1,now(),now() + interval '14 days',20);
      INSERT INTO "SprintPlan" (id,"organizationId","initiativeId","sprintId",goal,"capacityPoints","createdByUserId","updatedAt")
      VALUES ('sprint-plan-a','org-a','init-a','sprint-a','Deliver the validated stories',20,'user-org-a',now());
      INSERT INTO "SprintPlanningItem" (id,"sprintPlanId","storyId","readinessAssessmentId","estimatePoints","order")
      VALUES ('sprint-item-a','sprint-plan-a','story-a','readiness-a',3,0);
    `));
    await expect(asUser(authA, () => pg.exec(`INSERT INTO "RefinementSessionItem" (id,"sessionId","storyId","updatedAt") VALUES ('session-item-cross','session-a','artifact-b',now())`))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "SprintReadinessAssessment" (id,"organizationId","initiativeId","storyId","inputFingerprint",decision,reason,"decidedByUserId")
      VALUES ('readiness-cross','org-a','init-a','artifact-b',repeat('b',64),'not_ready','Wrong initiative','user-org-a')
    `))).rejects.toThrow();
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "SprintPlan" WHERE id='sprint-plan-a'`))).rows).toEqual([]);
    await expect(asUser(authA, () => pg.exec(`UPDATE "SprintReadinessAssessment" SET decision='overridden' WHERE id='readiness-a'`))).rejects.toThrow();
  });

  it("protects in-sprint clarification targets, tenant isolation, and immutable evidence", async () => {
    await asUser(authA, () => pg.exec(`
      UPDATE "SprintPlan" SET status='committed', "committedByUserId"='user-org-a', "committedAt"=now() WHERE id='sprint-plan-a';
      INSERT INTO "InSprintClarification" (id,"organizationId","initiativeId","sprintId","storyId",question,"dedupeKey","requesterUserId","updatedAt")
      VALUES ('clarification-a','org-a','init-a','sprint-a','story-a','What happens when the provider is unavailable?',repeat('d',64),'user-org-a',now());
      INSERT INTO "InSprintClarificationRevision" (id,"organizationId","clarificationId","fromRevision","toRevision","previousData","nextData",reason,"actorUserId")
      VALUES ('clarification-revision-a','org-a','clarification-a',1,2,'{}','{}','PO answered','user-org-a');
      INSERT INTO "ClarificationAiSuggestion" (id,"organizationId","clarificationId",fingerprint,"draftAnswer","informationUsed","generatedByUserId")
      VALUES ('clarification-ai-a','org-a','clarification-a',repeat('c',64),'Return the documented unavailable state.','Story and approved criteria','user-org-a');
    `));
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "InSprintClarification" WHERE id='clarification-a'`))).rows).toEqual([]);
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "InSprintClarification" (id,"organizationId","initiativeId","sprintId","storyId",question,"dedupeKey","requesterUserId","updatedAt")
      VALUES ('clarification-cross','org-a','init-a','sprint-a','artifact-b','Cross-tenant question',repeat('e',64),'user-org-a',now())
    `))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`UPDATE "InSprintClarification" SET status='answered' WHERE id='clarification-a'`))).rejects.toThrow();
    const revisionMutation = await asUser(authA, () => pg.query(`UPDATE "InSprintClarificationRevision" SET reason='Forged' WHERE id='clarification-revision-a' RETURNING id`));
    expect(revisionMutation.rows).toEqual([]);
    expect((await asUser(authA, () => pg.query<{ reason: string }>(`SELECT reason FROM "InSprintClarificationRevision" WHERE id='clarification-revision-a'`))).rows[0].reason).toBe("PO answered");
    await expect(asUser(authA, () => pg.exec(`UPDATE "ClarificationAiSuggestion" SET "draftAnswer"='Forged' WHERE id='clarification-ai-a'`))).rejects.toThrow();
    await asUser(authA, () => pg.exec(`UPDATE "ClarificationAiSuggestion" SET status='dismissed', "actedByUserId"='user-org-a', "actedAt"=now() WHERE id='clarification-ai-a'`));
    await expect(asUser(authA, () => pg.exec(`UPDATE "ClarificationAiSuggestion" SET status='used' WHERE id='clarification-ai-a'`))).rejects.toThrow();
  });

  it("protects demo targets, uniqueness, readiness evidence, and immutable history", async () => {
    await asUser(authA, () => pg.exec(`
      INSERT INTO "DemoItem" (id,"organizationId","initiativeId","sprintId","storyId",title,"createdByUserId","updatedAt")
      VALUES ('demo-a','org-a','init-a','sprint-a','story-a','Show the completed story','user-org-a',now());
      INSERT INTO "DemoItemRevision" (id,"organizationId","demoItemId","fromRevision","toRevision","previousData","nextData",reason,"actorUserId")
      VALUES ('demo-revision-a','org-a','demo-a',1,2,'{}','{}','Prepared demo','user-org-a');
      INSERT INTO "DemoAiSuggestion" (id,"organizationId","demoItemId",kind,fingerprint,content,"informationUsed","generatedByUserId")
      VALUES ('demo-ai-a','org-a','demo-a','purpose',repeat('f',64),'Explain the delivered customer value.','Story and approved criteria','user-org-a');
    `));
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "DemoItem" (id,"organizationId","initiativeId","sprintId","storyId",title,"createdByUserId","updatedAt")
      VALUES ('demo-duplicate','org-a','init-a','sprint-a','story-a','Duplicate agenda item','user-org-a',now())
    `))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`UPDATE "DemoItem" SET status='ready' WHERE id='demo-a'`))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "DemoItem" (id,"organizationId","initiativeId","sprintId","storyId",title,"repeatReason","createdByUserId","updatedAt")
      VALUES ('demo-cross','org-a','init-a','sprint-a','artifact-b','Cross tenant target','Repeat requested','user-org-a',now())
    `))).rejects.toThrow();
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "DemoItem" WHERE id='demo-a'`))).rows).toEqual([]);
    expect((await asUser(authA, () => pg.query(`UPDATE "DemoItemRevision" SET reason='Forged' WHERE id='demo-revision-a' RETURNING id`))).rows).toEqual([]);
    await expect(asUser(authA, () => pg.exec(`UPDATE "DemoAiSuggestion" SET content='Forged' WHERE id='demo-ai-a'`))).rejects.toThrow();
    await asUser(authA, () => pg.exec(`UPDATE "DemoAiSuggestion" SET status='dismissed', "actedByUserId"='user-org-a', "actedAt"=now() WHERE id='demo-ai-a'`));
    await expect(asUser(authA, () => pg.exec(`UPDATE "DemoAiSuggestion" SET status='used' WHERE id='demo-ai-a'`))).rejects.toThrow();
  });

  it("isolates sprint reviews and protects final snapshots, revisions, and AI evidence", async () => {
    await asUser(authA, () => pg.exec(`
      UPDATE "DemoItem" SET purpose='Explain customer value', "presenterNameSnapshot"='Avery', "completedWork"='The story is complete',
        status='ready', "readinessReason"='Evidence reviewed', "decidedByUserId"='user-org-a', "decidedAt"=now(), revision=2
      WHERE id='demo-a';
      INSERT INTO "PlanningMeeting" (id,"organizationId","projectId","initiativeId","meetingType","sprintId",title,purpose,"createdByUserId","updatedAt")
      VALUES ('review-meeting-a','org-a','project-a','init-a','sprint_review','sprint-a','Sprint 1 Review','Review delivered value','user-org-a',now());
      INSERT INTO "PlanningMeetingWorkItem" (id,"organizationId","meetingId","demoItemId")
      VALUES ('review-work-a','org-a','review-meeting-a','demo-a');
      INSERT INTO "SprintReview" (id,"organizationId","projectId","initiativeId","sprintId","meetingId","draftSnapshot","createdByUserId","updatedAt")
      VALUES ('review-a','org-a','project-a','init-a','sprint-a','review-meeting-a','{"readyDemos":[{"id":"demo-a"}]}','user-org-a',now());
      INSERT INTO "SprintReviewRevision" (id,"organizationId","reviewId","fromRevision","toRevision","previousData","nextData",reason,"actorUserId")
      VALUES ('review-revision-a','org-a','review-a',1,2,'{}','{}','Final review approved','user-org-a');
      INSERT INTO "SprintReviewAiSuggestion" (id,"organizationId","reviewId",kind,fingerprint,content,"informationUsed","generatedByUserId")
      VALUES ('review-ai-a','org-a','review-a','summary',repeat('9',64),'The sprint delivered the planned story.','Committed sprint and demo evidence','user-org-a');
      UPDATE "SprintReview" SET status='finalized', "finalSnapshot"='{"readyDemos":[{"id":"demo-a"}],"summary":"Approved"}', "finalizedByUserId"='user-org-a', "finalizedAt"=now(), revision=2 WHERE id='review-a';
    `));
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "SprintReview" WHERE id='review-a'`))).rows).toEqual([]);
    await expect(asUser(authA, () => pg.exec(`UPDATE "SprintReview" SET "finalSnapshot"='{"forged":true}' WHERE id='review-a'`))).rejects.toThrow();
    expect((await asUser(authA, () => pg.query(`UPDATE "SprintReviewRevision" SET reason='Forged' WHERE id='review-revision-a' RETURNING id`))).rows).toEqual([]);
    await expect(asUser(authA, () => pg.exec(`UPDATE "SprintReviewAiSuggestion" SET content='Forged' WHERE id='review-ai-a'`))).rejects.toThrow();
    await asUser(authA, () => pg.exec(`UPDATE "SprintReviewAiSuggestion" SET status='dismissed', "actedByUserId"='user-org-a', "actedAt"=now() WHERE id='review-ai-a'`));
    await expect(asUser(authA, () => pg.exec(`UPDATE "SprintReviewAiSuggestion" SET status='used' WHERE id='review-ai-a'`))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "PlanningMeetingWorkItem" (id,"organizationId","meetingId","storyId")
      VALUES ('review-work-cross','org-a','review-meeting-a','artifact-b')
    `))).rejects.toThrow();
    expect((await asUser(authA, () => pg.query(`SELECT "meetingType" FROM "PlanningMeeting" WHERE "sourceRefinementSessionId"='session-a'`))).rows).toEqual([{ meetingType: "refinement" }]);
  });

  it("isolates PO validation and preserves final decisions, criterion versions, and AI evidence", async () => {
    await asUser(authA, () => pg.exec(`
      UPDATE "DemoItem" SET status='demonstrated', "decidedByUserId"='user-org-a', "decidedAt"=now() WHERE id='demo-a';
      INSERT INTO "ProductValidation" (id,"organizationId","projectId","initiativeId","sprintId","storyId","demoItemId","sprintReviewId",status,"storyVersion","storySnapshot",sequence,"createdByUserId","updatedAt")
      VALUES ('validation-a','org-a','project-a','init-a','sprint-a','story-a','demo-a','review-a','pending',1,'{"title":"Story A","version":1}',1,'user-org-a',now());
      INSERT INTO "ValidationCriterionResult" (id,"organizationId","validationId","criterionId","criterionVersion","criterionSnapshot","updatedAt")
      VALUES ('validation-criterion-a','org-a','validation-a','criterion-a',1,'{"title":"Criterion A","version":1}',now());
      INSERT INTO "ValidationAiSuggestion" (id,"organizationId","validationId",fingerprint,content,"informationUsed",model,"generatedByUserId")
      VALUES ('validation-ai-a','org-a','validation-a',repeat('7',64),'Evidence summary only.','Story, criteria, and evidence','gpt-test','user-org-a');
    `));
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "ProductValidation" WHERE id='validation-a'`))).rows).toEqual([]);
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "ValidationCriterionResult" (id,"organizationId","validationId","criterionId","criterionVersion","criterionSnapshot","updatedAt")
      VALUES ('validation-criterion-cross','org-a','validation-a','artifact-b',1,'{}',now())
    `))).rejects.toThrow();
    await asUser(authA, () => pg.exec(`
      UPDATE "ValidationCriterionResult" SET result='met', "evidenceNotes"='Observed in review' WHERE id='validation-criterion-a';
      INSERT INTO "ProductValidationRevision" (id,"organizationId","validationId","fromRevision","toRevision","previousData","nextData",reason,"actorUserId")
      VALUES ('validation-revision-a','org-a','validation-a',1,2,'{}','{}','PO accepted delivery','user-org-a');
      UPDATE "ProductValidation" SET status='accepted', "decisionReason"='All approved outcomes were demonstrated.', "finalizedByUserId"='user-org-a', "finalizedAt"=now(), revision=2 WHERE id='validation-a';
    `));
    await expect(asUser(authA, () => pg.exec(`UPDATE "ProductValidation" SET "decisionReason"='Changed later' WHERE id='validation-a'`))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`UPDATE "ValidationCriterionResult" SET result='not_met' WHERE id='validation-criterion-a'`))).rejects.toThrow();
    expect((await asUser(authA, () => pg.query(`UPDATE "ProductValidationRevision" SET reason='Forged' WHERE id='validation-revision-a' RETURNING id`))).rows).toEqual([]);
    await expect(asUser(authA, () => pg.exec(`UPDATE "ValidationAiSuggestion" SET content='Forged' WHERE id='validation-ai-a'`))).rejects.toThrow();
    await asUser(authA, () => pg.exec(`UPDATE "ValidationAiSuggestion" SET status='dismissed', "actedByUserId"='user-org-a', "actedAt"=now() WHERE id='validation-ai-a'`));
    await expect(asUser(authA, () => pg.exec(`UPDATE "ValidationAiSuggestion" SET status='used' WHERE id='validation-ai-a'`))).rejects.toThrow();
  });

  it("isolates release readiness and preserves approved evidence and history", async () => {
    await asUser(authA, () => pg.exec(`
      INSERT INTO "Release" (id,"prototypeId",name,"phaseNumber","targetDate","order")
      VALUES ('release-readiness-a','proto-a','Release readiness',1,now() + interval '14 days',99);
      INSERT INTO "ReleaseReadinessAssessment" (id,"organizationId","projectId","initiativeId","releaseId",sequence,status,"releaseSnapshot","createdByUserId","updatedAt")
      VALUES ('release-assessment-a','org-a','project-a','init-a','release-readiness-a',1,'draft','{"release":{"name":"Release readiness"}}','user-org-a',now());
      INSERT INTO "ReleaseReadinessCheck" (id,"organizationId","assessmentId","checkKey",label,status,explanation,"updatedAt")
      VALUES ('release-check-a','org-a','release-assessment-a','quality','Quality','pass','No severe open bugs',now());
      INSERT INTO "ReleaseReadinessRevision" (id,"organizationId","assessmentId","fromRevision","toRevision","previousData","nextData",reason,"actorUserId")
      VALUES ('release-revision-a','org-a','release-assessment-a',1,2,'{}','{}','Release evidence reviewed','user-org-a');
      INSERT INTO "ReleaseReadinessAiSuggestion" (id,"organizationId","assessmentId",fingerprint,summary,"stakeholderCommunication","informationUsed",model,"generatedByUserId")
      VALUES ('release-ai-a','org-a','release-assessment-a',repeat('6',64),'Draft summary only.','Draft stakeholder update.','Frozen release checks','gpt-test','user-org-a');
    `));
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "ReleaseReadinessAssessment" WHERE id='release-assessment-a'`))).rows).toEqual([]);
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "ReleaseReadinessCheck" (id,"organizationId","assessmentId","checkKey",label,status,explanation,"updatedAt")
      VALUES ('release-check-cross','org-b','release-assessment-a','cross','Cross tenant','pass','Forged',now())
    `))).rejects.toThrow();
    await asUser(authA, () => pg.exec(`UPDATE "ReleaseReadinessAssessment" SET status='approved', "decisionReason"='PO approved frozen evidence', "approvedByUserId"='user-org-a', "approvedAt"=now(), revision=2 WHERE id='release-assessment-a'`));
    await expect(asUser(authA, () => pg.exec(`UPDATE "ReleaseReadinessAssessment" SET "decisionReason"='Changed later' WHERE id='release-assessment-a'`))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`UPDATE "ReleaseReadinessCheck" SET status='fail' WHERE id='release-check-a'`))).rejects.toThrow();
    expect((await asUser(authA, () => pg.query(`UPDATE "ReleaseReadinessRevision" SET reason='Forged' WHERE id='release-revision-a' RETURNING id`))).rows).toEqual([]);
  });

  it("isolates feedback, enforces duplicate protection, and preserves reprioritization decisions", async () => {
    await asUser(authA, () => pg.exec(`
      INSERT INTO "FeedbackRecord" (id,"organizationId","projectId","initiativeId",title,details,source,category,"dedupeKey","createdByUserId","updatedAt")
      VALUES ('feedback-a','org-a','project-a','init-a','Reporting feedback','Customers cannot find reports.','customer','usability',repeat('5',64),'user-org-a',now());
      INSERT INTO "FeedbackRevision" (id,"organizationId","feedbackId","fromRevision","toRevision","previousData","nextData",reason,"actorUserId")
      VALUES ('feedback-revision-a','org-a','feedback-a',1,2,'{}','{}','Feedback triaged','user-org-a');
      INSERT INTO "ReprioritizationProposal" (id,"organizationId","feedbackId","entityType","entityId","expectedEntityRevision","currentPrioritySnapshot","proposedFactors",moscow,"roadmapLane",rationale,"createdByUserId","updatedAt")
      VALUES ('feedback-proposal-a','org-a','feedback-a','feature','capability-a',1,'{}','{"businessValue":5,"urgency":4,"userImpact":5,"dependencyImpact":3,"risk":3,"effort":3,"effortPoints":3,"bugSeverity":"not_applicable"}','must','now','Repeated customer feedback','user-org-a',now());
      INSERT INTO "FeedbackAiSuggestion" (id,"organizationId","feedbackId",kind,fingerprint,content,"informationUsed",model,"generatedByUserId")
      VALUES ('feedback-ai-a','org-a','feedback-a','summary',repeat('4',64),'{"summary":"Customers cannot locate reports."}','Feedback details','gpt-test','user-org-a');
    `));
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "FeedbackRecord" WHERE id='feedback-a'`))).rows).toEqual([]);
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "FeedbackRecord" (id,"organizationId","projectId","initiativeId",title,details,source,"dedupeKey","createdByUserId","updatedAt")
      VALUES ('feedback-duplicate','org-a','project-a','init-a','Duplicate','Duplicate','manual',repeat('5',64),'user-org-a',now())
    `))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`INSERT INTO "FeedbackRevision" (id,"organizationId","feedbackId","fromRevision","toRevision","previousData","nextData",reason) VALUES ('feedback-revision-cross','org-b','feedback-a',2,3,'{}','{}','Forged history')`))).rejects.toThrow();
    await asUser(authA, () => pg.exec(`UPDATE "ReprioritizationProposal" SET status='dismissed', "decisionReason"='PO retained current priority', "decidedByUserId"='user-org-a', "decidedAt"=now(), revision=2 WHERE id='feedback-proposal-a'`));
    await expect(asUser(authA, () => pg.exec(`UPDATE "ReprioritizationProposal" SET rationale='Changed later' WHERE id='feedback-proposal-a'`))).rejects.toThrow();
    expect((await asUser(authA, () => pg.query(`UPDATE "FeedbackRevision" SET reason='Forged' WHERE id='feedback-revision-a' RETURNING id`))).rows).toEqual([]);
  });

  it("isolates Jira credentials and previews while preventing OAuth-state replay", async () => {
    await asUser(authA, () => pg.exec(`
      INSERT INTO "JiraConnection" (id,"organizationId","initiativeId","configuredByUserId",status,"cloudId","projectId","projectKey","accessTokenCiphertext","refreshTokenCiphertext","tokenExpiresAt",scopes,"updatedAt")
      VALUES ('jira-a','org-a','init-a','user-org-a','connected','cloud-a','project-jira','GP','v1:encrypted-access-token-value','v1:encrypted-refresh-token-value',now() + interval '1 hour','read:jira-work',now());
      INSERT INTO "JiraOAuthState" (id,"stateHash","organizationId","initiativeId","userId","expiresAt")
      VALUES ('jira-state-a',repeat('a',64),'org-a','init-a','user-org-a',now() + interval '10 minutes');
      INSERT INTO "JiraImportRun" (id,"organizationId","initiativeId","connectionId",jql,"sourceFingerprint","initiatedByUserId","updatedAt")
      VALUES ('jira-run-a','org-a','init-a','jira-a','project = GP',repeat('b',64),'user-org-a',now());
      INSERT INTO "JiraImportItem" (id,"organizationId","importRunId","externalIssueId","externalKey","issueTypeId","issueTypeName","targetType",summary,"sourceSnapshot","sourceHash",action,"updatedAt")
      VALUES ('jira-item-a','org-a','jira-run-a','10001','GP-1','10000','Story','story','Imported story','{}',repeat('c',64),'create',now());
    `));
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "JiraConnection" WHERE id='jira-a'`))).rows).toEqual([]);
    expect((await asUser(authB, () => pg.query(`SELECT id FROM "JiraImportItem" WHERE id='jira-item-a'`))).rows).toEqual([]);
    await expect(asUser(authA, () => pg.exec(`
      INSERT INTO "JiraConnection" (id,"organizationId","initiativeId","configuredByUserId","accessTokenCiphertext","refreshTokenCiphertext","tokenExpiresAt",scopes,"updatedAt")
      VALUES ('jira-cross','org-a','init-b','user-org-a','v1:encrypted-access-token-value','v1:encrypted-refresh-token-value',now() + interval '1 hour','read:jira-work',now())
    `))).rejects.toThrow();
    await asUser(authA, () => pg.exec(`UPDATE "JiraOAuthState" SET "consumedAt"=now() WHERE id='jira-state-a'`));
    await expect(asUser(authA, () => pg.exec(`UPDATE "JiraOAuthState" SET "returnPath"='/integrations/jira?replay=1' WHERE id='jira-state-a'`))).rejects.toThrow();
    await expect(asUser(authA, () => pg.exec(`INSERT INTO "JiraImportItem" (id,"organizationId","importRunId","externalIssueId","externalKey","issueTypeId","issueTypeName","targetType",summary,"sourceSnapshot","sourceHash",action,"updatedAt") VALUES ('jira-item-cross','org-b','jira-run-a','10002','GP-2','10000','Story','story','Forged','{}',repeat('d',64),'create',now())`))).rejects.toThrow();
  });

});
