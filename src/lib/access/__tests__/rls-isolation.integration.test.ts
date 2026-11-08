// Real-database isolation tests (directive: "Do not proceed until isolation
// tests pass" — gates the Project-layer restructure before any Phase 2 UI
// work). Unlike resolution.test.ts/mutations.test.ts (mocked `db`), this
// exercises the actual live Postgres connection: the `app_rw` role, the real
// RLS policies, and the production `db`/`establishAuthContext` call pattern —
// proving RLS itself blocks cross-tenant access, not just the app-layer guard.
//
// Fixtures are created/torn down through a separate bypass-RLS client
// (`adminDb`, connected via DIRECT_URL) — the production `db` export cannot
// bootstrap cross-tenant fixtures in one pass, since it always runs under
// whichever single auth context is currently established. Fabricated
// `authUserId` UUIDs are fine: RLS's identity check (`is_org_member` et al.)
// only compares against `OrganizationMember.authUserId` / `User.authUserId`,
// never against a real Supabase `auth.users` row.

import { writeFile, mkdir } from "node:fs/promises";
import { GET as readinessProbe } from "@/app/api/ready/route";
import { createHash, randomUUID } from "node:crypto";
import { AsyncResource } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, establishAuthContext, rawDb, withAuthenticatedDatabaseContext, withServiceContext, withTransaction } from "@/lib/db";
import { loadWorkerReadiness, observeWorker } from "@/lib/jobs/executionHealth";
import { applyJiraImport, currentTargetFingerprint, sourceSnapshot } from "@/lib/jira/import";
import { buildImportFieldReview, fieldBaselines } from "@/lib/jira/fieldReview";
import { emptyRequest } from "@/lib/requests/model";
import { saveRequest } from "@/lib/requests/service";
import { processJiraJobs } from "@/lib/jira/jobs";
import { ensureFeatureProjection } from "@/lib/planning/featureIdentity";
import { createRegenerationProposal, applyRegenerationProposal } from "@/lib/generation/proposals";
import type { ReconciliationItem } from "@/lib/generation/reconciliation";
import { saveGeneralIntake } from "@/lib/planning/saveGeneralIntake";
import { loadPlanningEvidence } from "@/lib/planning/readiness";
import { saveFeature } from "@/lib/backlog/service";
import { loadGlobalDashboardData } from "@/lib/dashboard/globalDashboardData";

// These tests create isolated fixtures. Never run them against Production.
const stagingRef = "qbogvclmehvrtuwiktos";
for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
  const value = process.env[key];
  if (!value) throw new Error("Staging database credentials are required.");
  const url = new URL(value);
  const bound = url.hostname === `db.${stagingRef}.supabase.co` ||
    (url.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(url.username).endsWith(`.${stagingRef}`));
  if (process.env.STAGING_SUPABASE_PROJECT_REF !== stagingRef || !bound || process.env.APP_ENVIRONMENT !== "staging") {
    throw new Error("Live security tests are restricted to the independent Clarivia staging database.");
  }
}
const emptyContext = new AsyncResource("no-auth-test");
const fixtureOrganizations: string[] = [];

const directUrl = process.env.DIRECT_URL;
if (!directUrl) throw new Error("DIRECT_URL is not set — required for isolation-test fixture setup/teardown.");
const fixtureAdminUrl = new URL(directUrl);
fixtureAdminUrl.searchParams.set("connection_limit", "1");
const adminDb = new PrismaClient({ datasourceUrl: fixtureAdminUrl.toString() });

interface Fixture {
  orgId: string;
  ownerAuthUserId: string;
  ownerUserId: string;
}

let orgA: Fixture;
let orgB: Fixture;
let memberAuthUserId: string; // second user in Org A, no InitiativeAccess grant
let memberUserId: string;
let projectA1Id: string;
let projectA2Id: string;
let projectB1Id: string;
let initiativeA1Id: string;
let initiativeB1Id: string;

async function createOrgWithOwner(name: string): Promise<Fixture> {
  const authUserId = randomUUID();
  const org = await adminDb.organization.create({ data: { name, workspaceType: "team" } });
  fixtureOrganizations.push(org.id);
  const user = await adminDb.user.create({
    data: { authUserId, homeOrganizationId: org.id, name: `${name} Owner`, email: `${authUserId}@test.local` },
  });
  await adminDb.organizationMember.create({
    data: { organizationId: org.id, authUserId, role: "owner", status: "active" },
  });
  await adminDb.organization.update({ where: { id: org.id }, data: { ownerUserId: user.id } });
  return { orgId: org.id, ownerAuthUserId: authUserId, ownerUserId: user.id };
}

beforeAll(async () => {
  const role = await rawDb.$queryRaw<{ safe: boolean }[]>`SELECT current_user='app_rw' AND NOT (rolsuper OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`;
  expect(role[0]?.safe).toBe(true);
  orgA = await createOrgWithOwner("Isolation Test Org A");
  orgB = await createOrgWithOwner("Isolation Test Org B");

  memberAuthUserId = randomUUID();
  const member = await adminDb.user.create({
    data: {
      authUserId: memberAuthUserId,
      homeOrganizationId: orgA.orgId,
      name: "Org A Member (no grant)",
      email: `${memberAuthUserId}@test.local`,
      accessLevel: "standard_user",
    },
  });
  memberUserId = member.id;
  await adminDb.organizationMember.create({
    data: { organizationId: orgA.orgId, authUserId: memberAuthUserId, role: "member", status: "active" },
  });

  const [projectA1, projectA2, projectB1] = await Promise.all([
    adminDb.project.create({
      data: { organizationId: orgA.orgId, createdByUserId: orgA.ownerUserId, name: "Project A1" },
    }),
    adminDb.project.create({
      data: { organizationId: orgA.orgId, createdByUserId: orgA.ownerUserId, name: "Project A2" },
    }),
    adminDb.project.create({
      data: { organizationId: orgB.orgId, createdByUserId: orgB.ownerUserId, name: "Project B1" },
    }),
  ]);
  projectA1Id = projectA1.id;
  projectA2Id = projectA2.id;
  projectB1Id = projectB1.id;

  const [initiativeA1, initiativeB1] = await Promise.all([
    adminDb.initiative.create({
      data: {
        organizationId: orgA.orgId,
        projectId: projectA1.id,
        userId: orgA.ownerUserId,
        name: "Initiative A1",
      },
    }),
    adminDb.initiative.create({
      data: {
        organizationId: orgB.orgId,
        projectId: projectB1.id,
        userId: orgB.ownerUserId,
        name: "Initiative B1",
      },
    }),
  ]);
  initiativeA1Id = initiativeA1.id;
  initiativeB1Id = initiativeB1.id;
});

afterAll(async () => {
  try {
    await adminDb.$transaction(async tx => {
      await tx.jiraConnection.updateMany({ where: { organizationId: { in: fixtureOrganizations } }, data: { status: "revoked" } });
      await tx.jiraSyncJob.deleteMany({ where: { organizationId: { in: fixtureOrganizations } } });
      await tx.jiraConnection.deleteMany({ where: { organizationId: { in: fixtureOrganizations } } });
      await tx.initiative.deleteMany({ where: { organizationId: { in: fixtureOrganizations } } });
      await tx.project.deleteMany({ where: { organizationId: { in: fixtureOrganizations } } });
      await tx.teamMember.deleteMany({ where: { team: { organizationId: { in: fixtureOrganizations } } } });
      await tx.team.deleteMany({ where: { organizationId: { in: fixtureOrganizations } } });
      await tx.user.deleteMany({ where: { homeOrganizationId: { in: fixtureOrganizations } } });
      await tx.organization.deleteMany({ where: { id: { in: fixtureOrganizations } } });
    }, { timeout: 15_000 });
  } finally {
    await adminDb.$disconnect();
    await rawDb.$disconnect();
    emptyContext.emitDestroy();
  }
}, 30_000);

describe("RLS isolation (real Postgres connection, not mocked)", () => {
  it("saves and resumes incomplete intake and develops a feature without experience, AI, generation or delivery records", async () => {
    const draftId = randomUUID();
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No AI or provider request is permitted in manual planning"));
    try {
      await expect(withAuthenticatedDatabaseContext({ authUserId: orgA.ownerAuthUserId, organizationId: orgA.orgId }, async () => await withTransaction(async () => {
        const user = await db.user.findUniqueOrThrow({ where: { id: orgA.ownerUserId } });
        const actor = { ...user, organizationId: orgA.orgId };
        const first = await saveGeneralIntake(actor, draftId, { name: "Minimal manual planning fixture" });
        const retry = await saveGeneralIntake(actor, draftId, { name: "Minimal manual planning fixture" });
        expect(retry).toEqual(first);
        expect(await db.initiative.count({ where: { id: draftId } })).toBe(1);
        const prototype = await db.prototype.findUniqueOrThrow({ where: { initiativeId: draftId } });
        expect(prototype.status).toBe("draft");
        expect(await db.artifactLayer.count({ where: { prototypeId: prototype.id, type: "story" } })).toBe(0);
        const feature = await saveFeature(draftId, { name: "A manually entered feature", description: "An incomplete draft can develop real planning work", backlogLane: "now", backlogStatus: "planned", ownerUserId: null, isMvp: true, businessValue: "high", riskLevel: "medium", dependsOnIds: [] });
        expect(await db.artifactLayer.count({ where: { prototypeId: prototype.id, type: "feature", sourceCapabilityId: feature.id } })).toBe(1);
        expect((await db.artifactLayer.findFirstOrThrow({ where: { prototypeId: prototype.id, type: "feature", sourceCapabilityId: feature.id } })).parentId).not.toBeNull();
        expect(await db.artifactLayer.count({ where: { prototypeId: prototype.id, type: "epic", sourceCapabilityId: feature.id } })).toBe(1);
        expect(await loadPlanningEvidence(draftId)).toMatchObject({ featureCount: 1, storyCount: 0, criteriaCount: 0, generationReady: false, missingContext: ["problem", "customer", "outcome"], committedSprintCount: 0, approvedReleaseCount: 0 });
        expect((await loadGlobalDashboardData(actor.id, [draftId])).primary).toMatchObject({ id: draftId, forecastKnown: false, planningEvidence: { featureCount: 1, committedSprintCount: 0 } });
        expect(await db.sprint.count({ where: { prototypeId: prototype.id } })).toBe(0);
        expect(await db.release.count({ where: { prototypeId: prototype.id } })).toBe(0);
        await expect(saveGeneralIntake(actor, draftId, { name: "Conflicting tab edit", expectedUpdatedAt: new Date(0).toISOString() })).rejects.toThrow("another tab");
        expect(network).not.toHaveBeenCalled();
        throw new Error("rollback manual planning acceptance fixture");
      }, { timeout: 60_000 }))).rejects.toThrow("rollback manual planning acceptance fixture");
    } finally { network.mockRestore(); }
    expect(await adminDb.initiative.findUnique({ where: { id: draftId } })).toBeNull();
  }, 70_000);

  it("reuses one canonical feature projection across concurrent requests and preserves editorial edits", async () => {
    const intake = await adminDb.intakeAnswerSet.create({ data: { initiativeId: initiativeA1Id } });
    const capability = await adminDb.capability.create({ data: {
      intakeAnswerSetId: intake.id, name: "Canonical fixture feature", isMvp: true, effortSize: "s", businessValue: "high",
    } });
    const prototype = await adminDb.prototype.create({ data: { initiativeId: initiativeA1Id } });
    const run = () => withAuthenticatedDatabaseContext({ authUserId: orgA.ownerAuthUserId, organizationId: orgA.orgId }, async () =>
      await ensureFeatureProjection(initiativeA1Id, capability.id));
    const results = await Promise.all([run(), run(), run()]);
    expect(new Set(results.map(row => row.id)).size).toBe(1);
    await adminDb.artifactLayer.update({ where: { id: results[0].id }, data: { title: "Human edited title", body: "Preserve this editorial explanation" } });
    expect(await run()).toMatchObject({ id: results[0].id, title: "Human edited title", body: "Preserve this editorial explanation" });
    expect(await adminDb.artifactLayer.count({ where: { prototypeId: prototype.id, type: "feature", sourceCapabilityId: capability.id } })).toBe(1);
    await expect(withAuthenticatedDatabaseContext({ authUserId: orgB.ownerAuthUserId, organizationId: orgB.orgId }, async () =>
      await ensureFeatureProjection(initiativeA1Id, capability.id))).rejects.toThrow("Feature not found");
  }, 20_000);

  it("Account B cannot read Account A's Projects by real id", async () => {
    establishAuthContext(orgB.ownerAuthUserId);
    const [a1, a2] = await Promise.all([
      db.project.findUnique({ where: { id: projectA1Id } }),
      db.project.findUnique({ where: { id: projectA2Id } }),
    ]);
    expect(a1).toBeNull();
    expect(a2).toBeNull();
  });

  it("Account A cannot read Account B's Project by a guessed-but-real UUID", async () => {
    establishAuthContext(orgA.ownerAuthUserId);
    const b1 = await db.project.findUnique({ where: { id: projectB1Id } });
    expect(b1).toBeNull();
  });

  it("Account A cannot read Account B's Initiative by a guessed-but-real UUID", async () => {
    establishAuthContext(orgA.ownerAuthUserId);
    const b1 = await db.initiative.findUnique({ where: { id: initiativeB1Id } });
    expect(b1).toBeNull();
  });

  it("Account A can read its own Projects A1 and A2, never Account B's", async () => {
    establishAuthContext(orgA.ownerAuthUserId);
    const projects = await db.project.findMany({ where: { organizationId: orgA.orgId } });
    const ids = projects.map((p) => p.id).sort();
    expect(ids).toEqual([projectA1Id, projectA2Id].sort());
  });

  it("an Org A member with no InitiativeAccess grant sees Project A1 (org-level) but resolves no access on Initiative A1", async () => {
    establishAuthContext(memberAuthUserId);

    // Org-level: Project visibility derives from OrganizationMember alone (no
    // ProjectAccess grant table — see Project's schema.prisma comment).
    const project = await db.project.findUnique({ where: { id: projectA1Id } });
    expect(project).not.toBeNull();

    // Initiative-level: InitiativeAccess remains the fine-grained gate,
    // unchanged by the Project layer.
    const { getResolvedAccess } = await import("@/lib/access/initiativeAccess");
    const access = await getResolvedAccess(
      { id: memberUserId, organizationId: orgA.orgId, accessLevel: "standard_user", status: "active", memberType: "internal" },
      initiativeA1Id,
    );
    expect(access).toBe("not_found");
  });

  it("Account B cannot create an Initiative under Account A's Project — blocked by RLS itself, not just the app guard", async () => {
    establishAuthContext(orgB.ownerAuthUserId);
    await expect(
      db.initiative.create({
        data: {
          organizationId: orgA.orgId,
          projectId: projectA1Id,
          userId: orgB.ownerUserId,
          name: "Attempted cross-tenant initiative",
        },
      }),
    ).rejects.toThrow();

    // Confirm nothing was actually inserted despite the attempt.
    establishAuthContext(orgA.ownerAuthUserId);
    const initiatives = await db.initiative.findMany({ where: { projectId: projectA1Id } });
    expect(initiatives.map((i) => i.id)).toEqual([initiativeA1Id]);
  });

  it("Account B cannot create a Project directly under Account A's organization — blocked by RLS itself", async () => {
    establishAuthContext(orgB.ownerAuthUserId);
    await expect(
      db.project.create({
        data: { organizationId: orgA.orgId, createdByUserId: orgB.ownerUserId, name: "Attempted cross-tenant project" },
      }),
    ).rejects.toThrow();
  });

  it("fails without context and denies service context tenant reads", async () => {
    await expect(emptyContext.runInAsyncScope(async () => await db.project.findMany({ take: 1 }))).rejects.toThrow("Database access outside request auth context");
    expect(await withServiceContext(async () => await db.project.findMany({ where: { id: projectA1Id } }))).toEqual([]);
  });

  it("isolates concurrent verified users and leaves no PostgreSQL claims after pooled transactions", async () => {
    const results = await Promise.all([orgA, orgB].map(org => withAuthenticatedDatabaseContext({ authUserId: org.ownerAuthUserId, organizationId: org.orgId }, async () => {
      await Promise.resolve();
      const projects = await db.project.findMany({ where: { organizationId: { in: [orgA.orgId, orgB.orgId] } } });
      const claims = await db.$queryRaw<{ actor: string }[]>`SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub') AS actor`;
      expect(projects.every(project => project.organizationId === org.orgId)).toBe(true);
      return claims[0].actor;
    })));
    expect(results).toEqual([orgA.ownerAuthUserId, orgB.ownerAuthUserId]);
    for (let attempt = 0; attempt < 6; attempt++) {
      const claims = await rawDb.$queryRaw<{ actor: string | null }[]>`SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub') AS actor`;
      expect(claims[0].actor).toBeNull();
    }
  });

  it("rolls back writes inside the verified database context", async () => {
    const id = randomUUID();
    await expect(withAuthenticatedDatabaseContext({ authUserId: orgA.ownerAuthUserId, organizationId: orgA.orgId }, async () => {
      await withTransaction(async () => {
        await db.project.create({ data: { id, organizationId: orgA.orgId, createdByUserId: orgA.ownerUserId, name: "Rollback verification" } });
        throw new Error("intentional rollback");
      });
    })).rejects.toThrow("intentional rollback");
    expect(await adminDb.project.findUnique({ where: { id } })).toBeNull();
  });

  it("rechecks revoked membership after an identity scope was established", async () => {
    try {
      await withAuthenticatedDatabaseContext({ authUserId: memberAuthUserId, organizationId: orgA.orgId }, async () => {
        await adminDb.organizationMember.updateMany({ where: { authUserId: memberAuthUserId, organizationId: orgA.orgId }, data: { status: "disabled" } });
        expect(await db.project.findUnique({ where: { id: projectA1Id } })).toBeNull();
      });
    } finally {
      await adminDb.organizationMember.updateMany({ where: { authUserId: memberAuthUserId, organizationId: orgA.orgId }, data: { status: "active" } });
    }
  });

  it("records failed worker stages, signals consecutive failures, and recovers readiness", async () => {
    const log = vi.spyOn(console, "error");
    const previousRelease = process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.VERCEL_GIT_COMMIT_SHA = "a".repeat(40);
    const idle = async () => ({ data: null, counts: { processed: 0, completed: 0, retried: 0, failed: 0 } });
    try {
      for (let cycle = 0; cycle < 2; cycle++) {
        await expect(observeWorker("jira", async stage => {
          stage("retention");
          throw Object.assign(new Error("Synthetic staging health failure"), { code: "STAGING_HEALTH_PROBE" });
        })).rejects.toThrow("Synthetic staging health failure");
      }
      expect((await loadWorkerReadiness()).jira).toBe("failed");
      const previousSecret = process.env.BACKGROUND_WORKER_SECRET;
      process.env.BACKGROUND_WORKER_SECRET = "synthetic-readiness-test-only";
      const response = await readinessProbe();
      if (previousSecret === undefined) delete process.env.BACKGROUND_WORKER_SECRET; else process.env.BACKGROUND_WORKER_SECRET = previousSecret;
      expect(response.status).toBe(503);
      const evidence = await response.json();
      expect(evidence.workers.jira).toBe("failed");
      expect(evidence.workerObservation).toHaveLength(2);
      expect(evidence.workerObservation.every((row: { coverageComplete: boolean }) => !row.coverageComplete)).toBe(true);
      expect(evidence.workerSignals.find((row: { worker: string }) => row.worker === "jira").consecutiveFailures).toBeGreaterThanOrEqual(2);
      await mkdir(".tmp-tests", { recursive: true });
      await writeFile(".tmp-tests/staging-worker-alert.json", JSON.stringify({ ...evidence, observedAt: new Date().toISOString(), synthetic: true }));
      expect(log.mock.calls.some(([line]) => String(line).includes('"event":"worker.alert.consecutive_failures"'))).toBe(true);
    } finally {
      log.mockRestore();
      await observeWorker("jira", idle);
      await observeWorker("jira", idle);
      await observeWorker("background", idle);
      if (previousRelease === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA; else process.env.VERCEL_GIT_COMMIT_SHA=previousRelease;
    }
    expect(await loadWorkerReadiness()).toEqual({ jira: "ready", background: "ready" });
  }, 20_000);

  it("enforces the live direct/team/viewer/external-admin action matrix without changing real memberships", async () => {
    const identity = { authUserId: memberAuthUserId, organizationId: orgA.orgId };
    const actions = () => withAuthenticatedDatabaseContext(identity, async () => (await db.$queryRaw<{
      read: boolean; edit: boolean; accept: boolean; approve: boolean; crossWorkspace: boolean;
    }[]>`SELECT app_private.can_initiative_action(${initiativeA1Id},'read') AS read,
      app_private.can_initiative_action(${initiativeA1Id},'edit') AS edit,
      app_private.can_initiative_action(${initiativeA1Id},'accept_story') AS accept,
      app_private.can_initiative_action(${initiativeA1Id},'approve_release') AS approve,
      app_private.can_initiative_action(${initiativeB1Id},'read') AS "crossWorkspace"`)[0]);
    try {
      const grant = await adminDb.initiativeAccess.create({ data: { initiativeId: initiativeA1Id, userId: memberUserId, permission: "edit" } });
      expect(await actions()).toEqual({ read: true, edit: true, accept: true, approve: false, crossWorkspace: false });
      await adminDb.initiativeAccess.update({ where: { id: grant.id }, data: { permission: "view" } });
      expect(await actions()).toEqual({ read: true, edit: false, accept: false, approve: false, crossWorkspace: false });
      expect(await withAuthenticatedDatabaseContext(identity, async () => await db.initiative.updateMany({ where: { id: initiativeA1Id }, data: { name: "Forbidden viewer change" } }))).toEqual({ count: 0 });
      await adminDb.initiativeAccess.delete({ where: { id: grant.id } });
      const team = await adminDb.team.create({ data: { organizationId: orgA.orgId, name: "Isolated security test team" } });
      await adminDb.teamMember.create({ data: { teamId: team.id, userId: memberUserId } });
      await adminDb.initiativeAccess.create({ data: { initiativeId: initiativeA1Id, teamId: team.id, permission: "edit" } });
      expect(await actions()).toMatchObject({ edit: true, accept: true, approve: false });
      await adminDb.user.update({ where: { id: memberUserId }, data: { memberType: "external" } });
      await adminDb.organizationMember.updateMany({ where: { authUserId: memberAuthUserId, organizationId: orgA.orgId }, data: { role: "admin" } });
      expect(await actions()).toEqual({ read: true, edit: false, accept: false, approve: false, crossWorkspace: false });
      expect(await withAuthenticatedDatabaseContext(identity, async () => await db.initiative.updateMany({ where: { id: initiativeA1Id }, data: { name: "Forbidden external change" } }))).toEqual({ count: 0 });
      await adminDb.teamMember.deleteMany({ where: { userId: memberUserId } });
      expect(await actions()).toEqual({ read: false, edit: false, accept: false, approve: false, crossWorkspace: false });
    } finally {
      await adminDb.initiativeAccess.deleteMany({ where: { initiativeId: initiativeA1Id } });
      await adminDb.user.update({ where: { id: memberUserId }, data: { memberType: "internal" } });
      await adminDb.organizationMember.updateMany({ where: { authUserId: memberAuthUserId, organizationId: orgA.orgId }, data: { role: "member", status: "active" } });
    }
  }, 20_000);

  it("claims one isolated synthetic Jira job once and records its terminal outcome without provider requests", async () => {
    await withAuthenticatedDatabaseContext({ authUserId: orgA.ownerAuthUserId, organizationId: orgA.orgId }, async () => {
      const connection = await db.jiraConnection.create({ data: {
        organizationId: orgA.orgId, initiativeId: initiativeA1Id, configuredByUserId: orgA.ownerUserId, status: "revoked",
        accessTokenCiphertext: "synthetic-staging-no-credential", refreshTokenCiphertext: "synthetic-staging-no-credential", tokenExpiresAt: new Date(0), scopes: "",
      } });
      const idempotencyKey = createHash("sha256").update(randomUUID()).digest("hex");
      const input = { organizationId: orgA.orgId, initiativeId: initiativeA1Id, connectionId: connection.id,
        // Missing exportItemId fails validation before any export execution.
        jobType: "export_item", payload: {}, idempotencyKey };
      const job = await db.jiraSyncJob.create({ data: input });
      await expect(db.jiraSyncJob.create({ data: input })).rejects.toMatchObject({ code: "P2002" });
      const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External HTTP is forbidden in this fixture"));
      try {
        const result = await processJiraJobs(1, `staging-probe-${randomUUID()}`, orgA.orgId);
        expect(result).toEqual({ claimed: 1, completed: 0, retried: 0, failed: 1 });
        expect(await processJiraJobs(1, `staging-probe-${randomUUID()}`, orgA.orgId)).toEqual({ claimed: 0, completed: 0, retried: 0, failed: 0 });
        expect(network).not.toHaveBeenCalled();
      } finally { network.mockRestore(); }
      expect(await db.jiraSyncAttempt.count({ where: { jobId: job.id } })).toBe(1);
      expect(await db.jiraSyncJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: "failed", attemptCount: 1 });
    });
  }, 20_000);

  it("applies reviewed additions atomically while retaining edited records, commitments and Jira links; rejects stale and repeated applications", async () => {
    const scope = { authUserId: orgA.ownerAuthUserId, organizationId: orgA.orgId };
    let proposalId = "";
    await expect(withAuthenticatedDatabaseContext(scope, async () => await withTransaction(async () => {
      const prototype = await db.prototype.findUniqueOrThrow({ where: { initiativeId: initiativeA1Id } });
      const feature = await db.artifactLayer.findFirstOrThrow({ where: { prototypeId: prototype.id, type: "feature" } });
      await db.intakeAnswerSet.update({ where: { initiativeId: initiativeA1Id }, data: {
        problemStatement: "Planning records must retain every human edit and delivery commitment.",
        targetCustomer: "Product owners and their delivery teams", outcomeStatement: "Preserve reviewed planning work through regeneration", teamSize: 3,
      } });
      const release = await db.release.create({ data: { prototypeId: prototype.id, name: "Human release", phaseNumber: 1, targetDate: new Date("2027-01-15"), order: 1, origin: "manual" } });
      const sprint = await db.sprint.create({ data: { prototypeId: prototype.id, sprintNumber: 1, phaseNumber: 1, startDate: new Date("2027-01-01"), endDate: new Date("2027-01-14"), capacityPoints: 10, origin: "manual", releaseId: release.id } });
      await db.capability.update({ where: { id: feature.sourceCapabilityId! }, data: { releaseId: release.id } });
      const epic = await db.artifactLayer.create({ data: { prototypeId: prototype.id, parentId: feature.id, type: "epic", title: "Human epic", sourceCapabilityId: feature.sourceCapabilityId, sourceType: "manual" } });
      const story = await db.artifactLayer.create({ data: { prototypeId: prototype.id, parentId: epic.id, type: "story", title: "Human story", body: "Hand-edited delivery work", sprintId: sprint.id, sourceCapabilityId: feature.sourceCapabilityId, sourceType: "manual", generationKey: "legacy-missing-source" } });
      const criterion = await db.artifactLayer.create({ data: { prototypeId: prototype.id, parentId: story.id, type: "acceptance_criterion", title: "Manual criterion", body: "Given a human edit, it survives", sourceType: "manual", sourceCapabilityId: feature.sourceCapabilityId } });
      const connection = await db.jiraConnection.findFirstOrThrow({ where: { initiativeId: initiativeA1Id } });
      const link = await db.jiraExternalLink.create({ data: { organizationId: orgA.orgId, initiativeId: initiativeA1Id, connectionId: connection.id, targetType: "story", targetId: story.id, externalIssueId: randomUUID(), externalKey: "FIXTURE-1", issueTypeName: "Story", sourceHash: "a".repeat(64), targetFingerprint: "b".repeat(64), lastImportedSnapshot: {} } });
      const first = await createRegenerationProposal(initiativeA1Id);
      await db.artifactLayer.update({ where: { id: feature.id }, data: { body: "Newer human edit" } });
      const stale = await db.regenerationProposal.findUniqueOrThrow({ where: { id: first.proposalId } });
      await expect(applyRegenerationProposal(initiativeA1Id, stale.id, stale.recordFingerprint, [])).rejects.toThrow("The plan or source changed");
      const fresh = await createRegenerationProposal(initiativeA1Id);
      proposalId = fresh.proposalId;
      const proposal = await db.regenerationProposal.findUniqueOrThrow({ where: { id: proposalId } });
      const items = (proposal.payload as unknown as { items: ReconciliationItem[] }).items;
      expect(items.some(item => item.kind === "mapping_required")).toBe(true);
      const decisions = items.map(item => ({ key: item.key, action: item.kind === "add" && ["roadmap", "roadmap_phase"].includes(item.proposed?.type ?? "") ? "apply" as const : "keep" as const }));
      const result = await applyRegenerationProposal(initiativeA1Id, proposalId, proposal.recordFingerprint, decisions);
      expect(result.prototypeId).toBe(prototype.id);
      expect(await db.artifactLayer.findUnique({ where: { id: story.id } })).toMatchObject({ body: "Hand-edited delivery work", sprintId: sprint.id, parentId: epic.id, generationReviewStatus: "source_missing_review" });
      expect(await db.artifactLayer.findUnique({ where: { id: criterion.id } })).toMatchObject({ body: "Given a human edit, it survives", parentId: story.id });
      expect(await db.capability.findUnique({ where: { id: feature.sourceCapabilityId! } })).toMatchObject({ releaseId: release.id });
      expect(await db.jiraExternalLink.findUnique({ where: { id: link.id } })).toMatchObject({ targetId: story.id });
      expect(await db.regenerationProposal.findUnique({ where: { id: proposalId } })).toMatchObject({ status: "applied", resultingMapping: result.mapping });
      await expect(applyRegenerationProposal(initiativeA1Id, proposalId, proposal.recordFingerprint, decisions)).rejects.toThrow("already applied");
      throw new Error("rollback regeneration acceptance fixture");
    }, { timeout: 60_000 }))).rejects.toThrow("rollback regeneration acceptance fixture");
    expect(await adminDb.regenerationProposal.findUnique({ where: { id: proposalId } })).toBeNull();
  }, 70_000);
  it("applies frozen Jira field reviews to the same canonical records and preserves bug triage; rejects local edits and duplicate apply", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No provider HTTP in this fixture"));
    try {
      await expect(withAuthenticatedDatabaseContext({ authUserId: orgA.ownerAuthUserId, organizationId: orgA.orgId }, async () => await withTransaction(async () => {
        const connection = await db.jiraConnection.create({ data: { organizationId: orgA.orgId, initiativeId: initiativeA1Id, configuredByUserId: orgA.ownerUserId, status: "connected", revision: 1,
          accessTokenCiphertext: "synthetic-no-credential", refreshTokenCiphertext: "synthetic-no-credential", tokenExpiresAt: new Date(0), scopes: "read:jira-work" } });
        const requestInput = emptyRequest();
        Object.assign(requestInput, { title: "Human bug", kind: "bug", source: "jira", sourceReference: "FIXTURE-2", requestor: "Test", problem: "Old body", requestedChange: "Human requested change", dependencies: "Human dependency" });
        Object.assign(requestInput.bug, { severity: "critical", affectedArea: "Human area", observedBehavior: "Old observed", expectedBehavior: "Human expected", reproductionDetails: "Human steps", environment: "Human environment", status: "confirmed" });
        const request = await saveRequest(initiativeA1Id, requestInput, undefined, { actorUserId: orgA.ownerUserId });
        const bug = await db.bugPlanningRecord.findUniqueOrThrow({ where: { requestId: request.id } });
        await db.bugPlanningRecord.update({ where: { id: bug.id }, data: { status: "in_progress", priority: "high", environment: "Triage environment" } });
        const issue = sourceSnapshot({ id: randomUUID(), key: "FIXTURE-2", summary: "Remote bug title", description: "Remote bug body", issueType: { id: "bug", name: "Bug", subtask: false }, status: { id: "done", name: "Done", category: "done" }, priority: { id: "low", name: "Lowest" }, labels: [], parentKey: null, storyPoints: null, updated: null });
        const target = { targetType: "bug", targetId: bug.id };
        const baseline = await currentTargetFingerprint(target);
        const link = await db.jiraExternalLink.create({ data: { organizationId: orgA.orgId, initiativeId: initiativeA1Id, connectionId: connection.id, ...target, externalIssueId: issue.id, externalKey: issue.key, issueTypeName: "Bug", sourceHash: "a".repeat(64), targetFingerprint: baseline!, lastImportedSnapshot: {} } });
        const run = await db.jiraImportRun.create({ data: { organizationId: orgA.orgId, initiativeId: initiativeA1Id, connectionId: connection.id, connectionRevision: 1, jql: "project = FIXTURE", sourceFingerprint: "b".repeat(64), initiatedByUserId: orgA.ownerUserId } });
        const review = buildImportFieldReview({ issue, targetType: "bug", local: { request: requestInput, status: bug.status }, targetFingerprint: baseline, baselineHashes: null, baselineAt: null, localChanged: false, remoteChanged: true });
        const item = await db.jiraImportItem.create({ data: { organizationId: orgA.orgId, importRunId: run.id, externalIssueId: issue.id, externalKey: issue.key, issueTypeId: "bug", issueTypeName: "Bug", ...target, summary: issue.summary, sourceSnapshot: issue, sourceHash: "c".repeat(64), reviewSnapshot: JSON.parse(JSON.stringify(review)), action: "update" } });
        await db.bugPlanningRecord.update({ where: { id: bug.id }, data: { revision: { increment: 1 } } });
        await expect(applyJiraImport(run.id, [item.id], "Reviewed fixture", orgA.ownerUserId)).rejects.toThrow("changed locally after review");
        // Return to the frozen version within this rollback-only fixture, then apply.
        await db.bugPlanningRecord.update({ where: { id: bug.id }, data: { revision: bug.revision } });
        await applyJiraImport(run.id, [item.id], "Reviewed fixture", orgA.ownerUserId);
        const saved = await db.planningRequest.findUniqueOrThrow({ where: { id: request.id } });
        expect(saved.data).toMatchObject({ title: "Remote bug title", problem: "Remote bug body", requestedChange: "Human requested change", dependencies: "Human dependency", bug: { observedBehavior: "Remote bug body", severity: "critical", status: "confirmed", expectedBehavior: "Human expected", environment: "Human environment", reproductionDetails: "Human steps" } });
        expect(await db.jiraExternalLink.findUnique({ where: { id: link.id } })).toMatchObject({ targetId: bug.id, lastImportedSnapshot: {}, fieldBaselines: fieldBaselines(issue, "bug", { request: saved.data, status: "in_progress" }) });
        expect(await db.bugPlanningRecord.findUnique({ where: { id: bug.id } })).toMatchObject({ status: "in_progress", priority: "high", environment: "Triage environment" });
        await expect(applyJiraImport(run.id, [item.id], "Repeated", orgA.ownerUserId)).rejects.toThrow("already been finalized");
        expect(network).not.toHaveBeenCalled();
        throw new Error("rollback Jira review fixture");
      }, { timeout: 60_000 }))).rejects.toThrow("rollback Jira review fixture");
    } finally { network.mockRestore(); }
  }, 70_000);

});
