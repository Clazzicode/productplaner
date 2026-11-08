import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";

const pairingSchema = z.object({}).strict();

async function POSTHandler(request: Request) {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const actor = authGuard.user;
  if (!actor.authUserId) return jsonError("Your authenticated account is not fully provisioned.", 409);
  establishAuthContext(actor.authUserId);
  const roleGuard = requireOrganizationRole(actor, ["owner", "admin"]);
  if (!roleGuard.ok) return roleGuard.response;

  const parsed = pairingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request.", 422);

  const code = randomBytes(32).toString("base64url");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.atlassianPairingCode.create({
    data: {
      id: randomUUID(),
      organizationId: actor.organizationId,
      codeHash,
      createdByUserId: actor.id,
      expiresAt,
    },
    select: { id: true },
  });

  return NextResponse.json({ code, expiresAt: expiresAt.toISOString() }, { status: 201 });
}

async function GETHandler() {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const actor = authGuard.user;
  if (!actor.authUserId) return jsonError("Your authenticated account is not fully provisioned.", 409);
  establishAuthContext(actor.authUserId);
  const installations = await db.atlassianInstallation.findMany({
    where: { organizationId: actor.organizationId },
    select: { id: true, cloudId: true, status: true, installedAt: true, lastSeenAt: true },
    orderBy: { installedAt: "desc" },
  });
  return NextResponse.json({ installations });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
