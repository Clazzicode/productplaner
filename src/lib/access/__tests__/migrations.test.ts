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
});
