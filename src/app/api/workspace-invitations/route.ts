import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { emailSchema } from "@/lib/auth/credentials";
import { db, establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";

const createSchema = z.object({ email: emailSchema });
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

async function GETHandler() {
  const guard = await requireCurrentUserApi();
  if (!guard.ok) return guard.response;
  establishAuthContext(guard.user.authUserId);
  if (!guard.user.authUserId || !["owner", "admin"].includes(guard.user.permissionRole)) return jsonError("Only workspace owners and admins can manage invitations.", 403);
  const invitations = await db.organizationInvitation.findMany({
    where: { organizationId: guard.user.organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, normalizedEmail: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" }, take: 50,
  });
  return NextResponse.json({ invitations });
}

async function POSTHandler(request: Request) {
  const guard = await requireCurrentUserApi();
  if (!guard.ok) return guard.response;
  establishAuthContext(guard.user.authUserId);
  if (!guard.user.authUserId || !["owner", "admin"].includes(guard.user.permissionRole)) return jsonError("Only workspace owners and admins can invite people.", 403);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const normalizedEmail = parsed.data.email;
  // Expired links must not permanently occupy the partial unique index.
  await db.organizationInvitation.updateMany({
    where: { organizationId: guard.user.organizationId, normalizedEmail, acceptedAt: null, revokedAt: null, expiresAt: { lte: new Date() } },
    data: { revokedAt: new Date() },
  });
  const existing = await db.organizationInvitation.findFirst({
    where: { organizationId: guard.user.organizationId, normalizedEmail, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (existing) return jsonError("An active invitation already exists for this email.", 409);

  const token = randomBytes(32).toString("base64url");
  let invitation;
  try {
    invitation = await db.organizationInvitation.create({
      data: {
        organizationId: guard.user.organizationId, normalizedEmail, role: "member",
        tokenHash: digest(token), invitedByAuthUserId: guard.user.authUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true, normalizedEmail: true, expiresAt: true },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return jsonError("An active invitation already exists for this email.", 409);
    }
    throw error;
  }
  // The raw bearer token is disclosed once to the authorized inviter only.
  return NextResponse.json({ invitation, inviteUrl: new URL(`/join#${token}`, request.url).toString() }, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
