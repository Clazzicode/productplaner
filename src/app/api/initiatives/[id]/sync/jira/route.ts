import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { connectJira, syncToJira } from "@/lib/sync/jiraStub";
import { syncActionSchema } from "@/lib/validation/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
