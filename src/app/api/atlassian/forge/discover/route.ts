import { z } from "zod";
import { discoverProjectMetadata, discoverProjects, JiraApiError } from "@/lib/atlassian/jiraApi";
import { isLinkedInstallation } from "@/lib/atlassian/installations";
import { ForgeAuthenticationError, verifyForgeInvocation } from "@/lib/atlassian/forgeAuth";
import { withApi } from "@/lib/observability";

export const runtime = "nodejs";

const discoverSchema = z.object({
  projectId: z.string().regex(/^\d{1,20}$/).optional(),
}).strict();

async function POSTHandler(request: Request) {
  try {
    const invocation = await verifyForgeInvocation(request);
    if (!await isLinkedInstallation(invocation)) {
      return Response.json({ error: "Connect this Jira site to an organization first." }, { status: 403 });
    }
    const parsed = discoverSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid discovery request." }, { status: 422 });
    const result = parsed.data.projectId
      ? { metadata: await discoverProjectMetadata(request, invocation, parsed.data.projectId) }
      : await discoverProjects(request, invocation);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ForgeAuthenticationError) {
      return Response.json({ error: "Invalid Forge invocation." }, { status: 401 });
    }
    if (error instanceof JiraApiError) {
      const status = error.status === 401 || error.status === 403 ? error.status
        : error.status === 422 ? 422 : error.status === 429 ? 429 : 502;
      return Response.json({ error: error.code }, { status });
    }
    throw error;
  }
}

export const POST = withApi(POSTHandler, { forgeRemote: true });
