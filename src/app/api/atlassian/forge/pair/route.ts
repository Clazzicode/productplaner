import { createHash } from "node:crypto";
import { z } from "zod";
import { consumePairingCode, registerVerifiedInstallation } from "@/lib/atlassian/installations";
import { ForgeAuthenticationError, verifyForgeInvocation } from "@/lib/atlassian/forgeAuth";
import { withApi } from "@/lib/observability";

export const runtime = "nodejs";

const bodySchema = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/) }).strict();

async function POSTHandler(request: Request) {
  try {
    const invocation = await verifyForgeInvocation(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid pairing code." }, { status: 422 });
    await registerVerifiedInstallation(invocation);
    const codeHash = createHash("sha256").update(parsed.data.code).digest("hex");
    const pairing = await consumePairingCode(codeHash, invocation);
    return Response.json({ ok: true, status: pairing.status });
  } catch (error) {
    if (error instanceof ForgeAuthenticationError) {
      return Response.json({ error: "Invalid Forge invocation." }, { status: 401 });
    }
    if (error instanceof Error && /pairing code|installation is invalid/i.test(error.message)) {
      return Response.json({ error: "The pairing code is invalid, expired, or already used." }, { status: 409 });
    }
    throw error;
  }
}

export const POST = withApi(POSTHandler, { forgeRemote: true });
