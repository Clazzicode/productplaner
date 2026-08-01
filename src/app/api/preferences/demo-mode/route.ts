import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

const demoModeSchema = z.object({ enabled: z.boolean() });

export async function PATCH(request: Request) {
  const parsed = demoModeSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const user = await getCurrentUser();
  await db.user.update({
    where: { id: user.id },
    data: { demoModeEnabled: parsed.data.enabled },
  });
  return NextResponse.json({ ok: true });
}
