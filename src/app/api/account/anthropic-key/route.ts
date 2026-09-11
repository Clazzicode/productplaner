import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { encryptSecret } from "@/lib/security/secretBox";

// Self-scoped like /api/account/start-over: whichever user getCurrentUser()
// resolves to is the only account this can ever touch — no separate
// permission check needed, and no accessLevel gate (this is a personal
// setting, not an org-admin one).
const bodySchema = z.object({ apiKey: z.string().trim().min(10, "That doesn't look like a full API key.") });

export async function PATCH(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  let encrypted: string;
  try {
    encrypted = encryptSecret(parsed.data.apiKey);
  } catch {
    return jsonError("Could not save your key — the server isn't configured to store secrets right now.", 500);
  }

  await db.user.update({
    where: { id: user.id },
    data: { anthropicApiKeyEncrypted: encrypted, anthropicApiKeyUpdatedAt: new Date() },
  });

  return NextResponse.json({ last4: parsed.data.apiKey.slice(-4) });
}

export async function DELETE() {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  await db.user.update({
    where: { id: user.id },
    data: { anthropicApiKeyEncrypted: null, anthropicApiKeyUpdatedAt: null },
  });
  return NextResponse.json({ ok: true });
}
