import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { connectJira, syncToJira } from "@/lib/sync/jiraStub";
import { syncActionSchema } from "@/lib/validation/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const guard = await requireInitiativeApiAccess(user.id, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = syncActionSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  try {
    if (parsed.data.action === "connect") {
      const conn = await connectJira(id);
      return NextResponse.json({ ok: true, status: conn.status });
    }
    const result = await syncToJira(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Sync failed.", 409);
  }
}
