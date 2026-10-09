import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { db, establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";
import {
  refinementActionSchema, refinementDecisionSchema, refinementItemUpdateSchema,
  refinementQuestionSchema, refinementSessionUpdateSchema,
} from "@/lib/refinementSessions/model";
import { applyRefinementSessionCommand, updateRefinementSession } from "@/lib/refinementSessions/service";

async function authorize(sessionId: string, minimum: "view" | "edit") {
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth;
  establishAuthContext(auth.user.authUserId);
  const session = await db.refinementSession.findFirst({ where: { id: sessionId, organizationId: auth.user.organizationId }, select: { initiativeId: true } });
  if (!session) return { ok: false as const, response: jsonError("Not found.", 404) };
  const access = await requireInitiativeApiAccess(auth.user, session.initiativeId, minimum); if (!access.ok) return access;
  return { ok: true as const, user: auth.user, initiativeId: session.initiativeId };
}

async function PATCHHandler(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params; const auth = await authorize(sessionId, "edit"); if (!auth.ok) return auth.response;
  const parsed = refinementSessionUpdateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return NextResponse.json({ session: await updateRefinementSession(sessionId, parsed.data, auth.user.id) }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}

async function POSTHandler(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params; const auth = await authorize(sessionId, "edit"); if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null) as { action?: string; data?: unknown } | null;
  const parsers = { question: refinementQuestionSchema, decision: refinementDecisionSchema, action: refinementActionSchema, item: refinementItemUpdateSchema } as const;
  if (!body?.action || !(body.action in parsers)) return jsonError("Choose a supported refinement action.", 422);
  const kind = body.action as keyof typeof parsers; const parsed = parsers[kind].safeParse(body.data); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try {
    const command = kind === "question" ? { kind, input: refinementQuestionSchema.parse(parsed.data) } as const
      : kind === "decision" ? { kind, input: refinementDecisionSchema.parse(parsed.data) } as const
      : kind === "action" ? { kind, input: refinementActionSchema.parse(parsed.data) } as const
      : { kind, input: refinementItemUpdateSchema.parse(parsed.data) } as const;
    return NextResponse.json(await applyRefinementSessionCommand(sessionId, command, auth.user.id), { status: 201 });
  } catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}

export const PATCH = withApi(PATCHHandler);
export const POST = withApi(POSTHandler);
