/** Keep each serverless Prisma instance from reserving a large connection pool. */
export function prismaDatabaseUrl(rawUrl: string | undefined, vercelEnvironment: string | undefined): string | undefined {
  if (!rawUrl || !vercelEnvironment) return rawUrl;

  const url = new URL(rawUrl);
  // A Vercel function owns its own Prisma pool. An older DATABASE_URL may
  // already contain a larger limit, so enforce the serverless cap here too.
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}
