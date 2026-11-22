import { z } from "zod";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext, withTransaction } from "@/lib/db";
import { requireJiraManager } from "@/lib/jira/routeAccess";
import { auditOrganization } from "@/lib/audit";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";

const inputSchema = z.object({ initiativeId: z.string().min(1).max(64) }).strict();

async function handler(request: Request) {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const access = await requireJiraManager(auth.user, parsed.data.initiativeId);
  if (!access.ok) return access.response;

  try {
    const connection = await withTransaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${auth.user.organizationId} || ':' || ${parsed.data.initiativeId}))`;
      const existing = await tx.jiraConnection.findFirst({
        where: { organizationId: auth.user.organizationId, initiativeId: parsed.data.initiativeId, status: { not: "revoked" } },
        orderBy: { createdAt: "desc" }, select: { id: true, status: true },
      });
      if (existing) return existing;

      const grants = await tx.$queryRaw<Array<{ status: string; resourceMetadata: unknown; grantedScopes: string[]; accessTokenExpiresAt: Date }>>`
        SELECT status, "resourceMetadata", "grantedScopes", "accessTokenExpiresAt"
        FROM app_private."AtlassianOAuthConnection"
        WHERE "organizationId" = ${auth.user.organizationId}
      `;
      const grant = grants[0];
      if (!grant || grant.status !== "connected") throw new BusinessError("Connect Atlassian in Integrations before setting up a Jira import.", 409);
      if (!Array.isArray(grant.grantedScopes) || !["read:jira-work", "offline_access"].every((scope) => grant.grantedScopes.includes(scope))) throw new BusinessError("Reconnect Atlassian with Jira read access before importing.", 409);
      const resources = Array.isArray(grant.resourceMetadata) ? grant.resourceMetadata.filter((value): value is { id: string; name: string; url: string } => {
        if (!value || typeof value !== "object") return false;
        const row = value as Record<string, unknown>;
        return typeof row.id === "string" && typeof row.name === "string" && typeof row.url === "string" && row.url.startsWith("https://");
      }) : [];
      if (!resources.length) throw new BusinessError("No authorized Jira site is available. Reconnect Atlassian.", 409);
      const site = resources.length === 1 ? resources[0] : null;
      const created = await tx.jiraConnection.create({ data: {
        organizationId: auth.user.organizationId,
        initiativeId: parsed.data.initiativeId,
        configuredByUserId: auth.user.id,
        status: site ? "project_selection_required" : "site_selection_required",
        cloudId: site?.id ?? null, siteUrl: site?.url ?? null, siteName: site?.name ?? null,
        accessTokenCiphertext: `vault-reference:${auth.user.organizationId}`,
        refreshTokenCiphertext: `vault-reference:${auth.user.organizationId}`,
        tokenExpiresAt: grant.accessTokenExpiresAt,
        scopes: grant.grantedScopes.join(" "),
        accessibleResources: resources,
      } });
      await auditOrganization({ organizationId: auth.user.organizationId, actorUserId: auth.user.id,
        entityType: "jira_connection", entityId: created.id, action: "jira.grant_attached",
        metadata: { initiativeId: parsed.data.initiativeId, availableSiteCount: resources.length },
      });
      return { id: created.id, status: created.status };
    });
    return Response.json({ connection });
  } catch (error) {
    return error instanceof BusinessError
      ? jsonError(error.message, error.status)
      : jsonError("Could not use the Atlassian connection.", 500);
  }
}

export const POST = withAuthenticatedApi(handler);
