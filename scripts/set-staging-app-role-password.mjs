import { PrismaClient } from "@prisma/client";

const password = process.env.STAGING_APP_RW_PASSWORD;
if (!password || password.length < 32 || !/^[A-Za-z0-9_-]+$/.test(password)) {
  console.error("Staging app-role password must be a 32+ character base64url secret stored in the protected GitHub staging environment.");
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

try {
  const [identity] = await prisma.$queryRaw`
    SELECT current_user AS role_name, rolsuper AS is_superuser, rolcreaterole AS can_create_roles
    FROM pg_roles
    WHERE rolname = current_user
  `;
  if (identity?.role_name !== "postgres" || (!identity.is_superuser && !identity.can_create_roles)) {
    console.error("Staging role password setup requires the staging postgres migration connection.");
    process.exit(1);
  }

  const [statement] = await prisma.$queryRaw`
    SELECT format('ALTER ROLE app_rw PASSWORD %L', ${password}) AS ddl
  `;
  await prisma.$executeRawUnsafe(statement.ddl);
  console.log("Configured the staging app_rw password from the protected secret.");
} catch {
  console.error("Could not configure the staging app_rw password; no credential values were logged.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
