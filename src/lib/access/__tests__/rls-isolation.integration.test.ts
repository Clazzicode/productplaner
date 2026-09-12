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

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, establishAuthContext } from "@/lib/db";

const directUrl = process.env.DIRECT_URL;
if (!directUrl) throw new Error("DIRECT_URL is not set — required for isolation-test fixture setup/teardown.");
const adminDb = new PrismaClient({ datasourceUrl: directUrl });

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
    await adminDb.initiative.deleteMany({ where: { organizationId: { in: [orgA.orgId, orgB.orgId] } } });
    await adminDb.project.deleteMany({ where: { organizationId: { in: [orgA.orgId, orgB.orgId] } } });
    await adminDb.user.deleteMany({ where: { homeOrganizationId: { in: [orgA.orgId, orgB.orgId] } } });
    await adminDb.organization.deleteMany({ where: { id: { in: [orgA.orgId, orgB.orgId] } } });
  } finally {
    await adminDb.$disconnect();
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
    expect(access).not.toBe("not_found");
    if (access !== "not_found") expect(access.level).toBe("none");
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
});
