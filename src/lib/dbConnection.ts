/** Keep each serverless Prisma instance from reserving a large connection pool. */
export function prismaDatabaseUrl(rawUrl: string | undefined, vercelEnvironment: string | undefined): string | undefined {
  if (!rawUrl || !vercelEnvironment) return rawUrl;

  const url = new URL(rawUrl);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
  return url.toString();
}
