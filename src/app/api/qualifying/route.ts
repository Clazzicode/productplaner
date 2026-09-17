import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { clearOnboardingStateServer } from "@/lib/onboarding/tempStateServer";
import { qualifyingExperienceLevelPatchSchema, qualifyingSchema } from "@/lib/validation/schemas";

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
  // This account's qualifying answers are now persisted — the temporary
  // onboarding cookie has served its purpose. Clearing it here (rather than
  // only at sign-in/sign-out boundaries) also stops a stale value from this
  // step (e.g. workspaceType) from making a *later* re-render of an
  // onboarding screen in this same session look like it's already been
  // answered.
  await clearOnboardingStateServer();
  return NextResponse.json({ profileId: profile.id });
}

/** Directive item 3: "Allow it to be changed later in Settings" — updates the
 * user's existing profile row rather than creating a second one. */
export async function PATCH(request: Request) {
  const parsed = qualifyingExperienceLevelPatchSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);

  const profile = user.profiles[0];
  if (!profile) return jsonError("Finish onboarding before changing this.", 409);

  await db.qualifyingProfile.update({
    where: { id: profile.id },
    data: { experienceLevel: parsed.data.experienceLevel },
  });
  return NextResponse.json({ ok: true });
}
