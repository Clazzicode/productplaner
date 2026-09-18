/**
 * One-off backfill (docs/V2-MULTI-TENANT-AUTH.md): links the existing demo
 * User row to a real Supabase Auth account, and creates the OrganizationMember
 * row its organization needs now that membership is real. Safe to re-run —
 * every step is a no-op if already done.
 *
 * Uses the Supabase service-role key (the one legitimate use of it in this
 * codebase) and the unextended `rawDb` client directly — this never runs
 * inside a request's RLS auth context, and RLS isn't enabled on any table
 * yet at the point this is meant to run anyway.
 *
 * Run with: npx tsx scripts/backfill-auth.ts
 */
import { randomBytes } from "node:crypto";
import { rawDb } from "../src/lib/db";
import { createSupabaseServiceClient } from "../src/lib/supabase/server";

const DEMO_EMAIL = "owner@planning.local";

async function main() {
  const user = await rawDb.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    console.log(`No user found with email ${DEMO_EMAIL} — nothing to backfill.`);
    return;
  }

  const supabase = createSupabaseServiceClient();
  let authUserId = user.authUserId;

  if (!authUserId) {
    const password = randomBytes(18).toString("base64url");
    const { data, error } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`Could not create the Supabase Auth user: ${error?.message}`);
    }
    authUserId = data.user.id;
    await rawDb.user.update({ where: { id: user.id }, data: { authUserId } });
    console.log(`Created auth.users row for ${DEMO_EMAIL}.`);
    console.log(`Temporary password (change it after first login): ${password}`);
  } else {
    console.log(`${DEMO_EMAIL} already has authUserId ${authUserId} — skipping auth.users creation.`);
  }

  const org = await rawDb.organization.findUnique({ where: { id: user.homeOrganizationId } });
  if (!org) throw new Error(`Organization ${user.homeOrganizationId} not found.`);

  if (!org.ownerUserId) {
    await rawDb.organization.update({
      where: { id: org.id },
      data: { ownerUserId: user.id, workspaceType: org.workspaceType === "solo" ? "solo" : "team" },
    });
    console.log(`Set Organization.ownerUserId for "${org.name}".`);
  }

  const existingMembership = await rawDb.organizationMember.findUnique({
    where: { organizationId_authUserId: { organizationId: org.id, authUserId } },
  });
  if (!existingMembership) {
    await rawDb.organizationMember.create({
      data: { organizationId: org.id, authUserId, role: "owner", status: "active" },
    });
    console.log(`Created OrganizationMember (owner) for ${DEMO_EMAIL} in "${org.name}".`);
  } else {
    console.log(`OrganizationMember row already exists — skipping.`);
  }

  console.log("Backfill complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => rawDb.$disconnect());
