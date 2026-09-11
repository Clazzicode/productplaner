import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { qualifyingSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const parsed = qualifyingSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const data = parsed.data;

  // FR-02: product-only filter. Non-product work never reaches intake.
  if (data.productType === "non_product") {
    return jsonError(
      "This platform plans software products only — marketing campaigns, office projects, and client services need a different tool. It records the answer but does not proceed to planning.",
      403,
    );
  }

  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const profile = await db.qualifyingProfile.create({
    data: { userId: user.id, ...data, isProductWork: true },
  });
  // Solo vs Team/Organization, captured during onboarding as teamComposition.
  // Organization.workspaceType defaults to "solo" for every signup (a personal
  // workspace is auto-provisioned); flip it once the user confirms they're
  // actually planning as part of a team/org. Never flipped back to "solo" —
  // workspaceType is informational only, never an authorization signal.
  if (data.teamComposition !== "solo") {
    await db.organization.update({
      where: { id: user.organizationId },
      data: { workspaceType: "team" },
    });
  }
  return NextResponse.json({ profileId: profile.id });
}
