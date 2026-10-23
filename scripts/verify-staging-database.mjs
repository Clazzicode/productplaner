import { PrismaClient } from "@prisma/client";

const PRODUCTION_PROJECT_REF = "hzsrdpbdbfqaicropsha";
const FAILED_PREVIEW_BRANCH_REF = "arpiicazvcfdcwigearj";

function getProjectRef(value, isDatabaseUrl = false) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (!isDatabaseUrl) {
      return url.protocol === "https:" ? /^([a-z0-9-]+)\.supabase\.co$/.exec(url.hostname)?.[1] ?? null : null;
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return null;

    const directRef = /^db\.([a-z0-9-]+)\.supabase\.co$/.exec(url.hostname)?.[1];
    if (directRef) return directRef;

    if (url.hostname.endsWith(".pooler.supabase.com")) {
      return /^[^.]+\.([a-z0-9-]+)$/.exec(decodeURIComponent(url.username))?.[1] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

function fail(message) {
  console.error(`Staging database verification failed: ${message}`);
  process.exit(1);
}

const expectedRef = process.env.STAGING_SUPABASE_PROJECT_REF;
if (!expectedRef || !/^[a-z0-9-]{20}$/.test(expectedRef)) {
  fail("STAGING_SUPABASE_PROJECT_REF must be the exact 20-character Supabase staging project ref.");
}
if (expectedRef === PRODUCTION_PROJECT_REF) fail("the expected project ref is the production project.");
if (expectedRef === FAILED_PREVIEW_BRANCH_REF) {
  fail("the current staging preview branch has a failed, divergent Supabase migration history; use a clean independent staging project.");
}

for (const [label, value, isDatabaseUrl] of [
  ["DATABASE_URL", process.env.DATABASE_URL, true],
  ["DIRECT_URL", process.env.DIRECT_URL, true],
]) {
  const actualRef = getProjectRef(value, isDatabaseUrl);
  if (!actualRef || actualRef !== expectedRef || actualRef === PRODUCTION_PROJECT_REF) {
    fail(`${label} is missing, unrecognizable, or does not match the configured staging project.`);
  }
}

const runtimeUrl = new URL(process.env.DATABASE_URL);
const runtimeUsername = decodeURIComponent(runtimeUrl.username);
const expectedRuntimeUsers = new Set(["app_rw", `app_rw.${expectedRef}`]);
if (!expectedRuntimeUsers.has(runtimeUsername)) {
  fail("DATABASE_URL must use the non-bypassing app_rw role.");
}
const appPassword = process.env.STAGING_APP_RW_PASSWORD;
if (!appPassword || appPassword.length < 32 || !/^[A-Za-z0-9_-]+$/.test(appPassword)) {
  fail("STAGING_APP_RW_PASSWORD must be a 32+ character base64url secret.");
}
if (decodeURIComponent(runtimeUrl.password) !== appPassword) {
  fail("DATABASE_URL password must match STAGING_APP_RW_PASSWORD.");
}

const migrationUrl = new URL(process.env.DIRECT_URL);
const migrationUsername = decodeURIComponent(migrationUrl.username);
if (!new Set(["postgres", `postgres.${expectedRef}`]).has(migrationUsername)) {
  fail("DIRECT_URL must use the staging postgres migration role.");
}

if (process.argv.includes("--preflight")) {
  console.log(`Staging target preflight passed for Supabase project ${expectedRef}.`);
  process.exit(0);
}

const prisma = new PrismaClient();
try {
  const [identity] = await prisma.$queryRaw`
    SELECT current_user AS role_name, rolbypassrls AS bypasses_rls
    FROM pg_roles
    WHERE rolname = current_user
  `;
  if (identity?.role_name !== "app_rw" || identity.bypasses_rls) {
    fail("DATABASE_URL must connect as the non-BYPASSRLS app_rw role.");
  }

  const relations = await prisma.$queryRaw`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
  `;
  const tableNames = new Set(relations.map(({ table_name }) => table_name));
  const requiredTables = [
    "Organization",
    "OrganizationMember",
    "OrganizationInvitation",
    "IntegrationConnection",
    "BackgroundJob",
  ];
  const missingTables = requiredTables.filter((tableName) => !tableNames.has(tableName));
  if (missingTables.length) fail(`required application tables are missing: ${missingTables.join(", ")}.`);

  const unprotectedTables = relations.filter(({ rls_enabled }) => !rls_enabled).map(({ table_name }) => table_name);
  if (unprotectedTables.length) fail(`public application tables without RLS: ${unprotectedTables.join(", ")}.`);

  const [privateSchema] = await prisma.$queryRaw`
    SELECT to_regclass('app_private.rate_limit_bucket') IS NOT NULL AS has_rate_limit_table
  `;
  if (!privateSchema?.has_rate_limit_table) fail("the private rate-limit table is missing.");

  console.log(`Verified staging schema on Supabase project ${expectedRef}: app_rw role, required tables, RLS, and private rate-limit table.`);
} catch (error) {
  if (error?.message?.startsWith("Staging database verification failed:")) throw error;
  fail("database checks could not be completed; inspect the workflow step without exposing connection strings.");
} finally {
  await prisma.$disconnect();
}
