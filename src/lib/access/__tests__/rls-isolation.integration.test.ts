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

import { createHash, randomUUID } from "node:crypto";
import { AsyncResource } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, establishAuthContext, rawDb, withAuthenticatedDatabaseContext, withServiceContext, withTransaction } from "@/lib/db";
import { loadWorkerReadiness, observeWorker } from "@/lib/jobs/executionHealth";
import { processJiraJobs } from "@/lib/jira/jobs";

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
    await adminDb.jiraConnection.updateMany({ where: { organizationId: { in: fixtureOrganizations } }, data: { status: "revoked" } });
    await adminDb.jiraSyncJob.deleteMany({ where: { organizationId: { in: fixtureOrganizations } } });
    await adminDb.jiraConnection.deleteMany({ where: { organizationId: { in: fixtureOrganizations } } });
    await adminDb.initiative.deleteMany({ where: { organizationId: { in: fixtureOrganizations } } });
    await adminDb.project.deleteMany({ where: { organizationId: { in: fixtureOrganizations } } });
    await adminDb.user.deleteMany({ where: { homeOrganizationId: { in: fixtureOrganizations } } });
    await adminDb.organization.deleteMany({ where: { id: { in: fixtureOrganizations } } });
  } finally {
    await adminDb.$disconnect();
    await rawDb.$disconnect();
    emptyContext.emitDestroy();
  }
});

describe("RLS isolation (real Postgres connection, not mocked)", () => {
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
    const idle = async () => ({ data: null, counts: { processed: 0, completed: 0, retried: 0, failed: 0 } });
    try {
      for (let cycle = 0; cycle < 2; cycle++) {
        await expect(observeWorker("jira", async stage => {
          stage("retention");
          throw Object.assign(new Error("Synthetic staging health failure"), { code: "STAGING_HEALTH_PROBE" });
        })).rejects.toThrow("Synthetic staging health failure");
      }
      expect((await loadWorkerReadiness()).jira).toBe("failed");
      expect(log.mock.calls.some(([line]) => String(line).includes('"event":"worker.alert.consecutive_failures"'))).toBe(true);
    } finally {
      log.mockRestore();
      await observeWorker("jira", idle);
      await observeWorker("jira", idle);
      await observeWorker("background", idle);
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
});
