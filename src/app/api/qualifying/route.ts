import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
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

  const user = await getCurrentUser();
  const profile = await db.qualifyingProfile.create({
    data: { userId: user.id, ...data, isProductWork: true },
  });
  return NextResponse.json({ profileId: profile.id });
}
