import { ForgeAuthenticationError, verifyForgeInvocation } from "@/lib/atlassian/forgeAuth";
import { registerVerifiedInstallation } from "@/lib/atlassian/installations";
import { withApi } from "@/lib/observability";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  try {
    const invocation = await verifyForgeInvocation(request);
    const installation = await registerVerifiedInstallation(invocation);
    return Response.json({
      ok: true,
      installation: {
        id: installation.id,
        status: installation.status,
        linked: installation.organization_id !== null,
      },
    });
  } catch (error) {
    if (error instanceof ForgeAuthenticationError) {
      return Response.json({ error: "Invalid Forge invocation." }, { status: 401 });
    }
    throw error;
  }
}

export const POST = withApi(POSTHandler);
