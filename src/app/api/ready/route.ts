import { withApi } from "@/lib/observability";
import { rawDb } from "@/lib/db";

async function GETHandler() {
  try {
    const rows = await rawDb.$queryRaw<{ safe: boolean }[]>`
      SELECT NOT (rolsuper OR rolbypassrls) AND current_user = 'app_rw'
        AND to_regclass('public."PlanApproval"') IS NOT NULL
        AND to_regclass('public."AuditEvent"') IS NOT NULL AS safe
      FROM pg_roles WHERE rolname = current_user`;
    if (!rows[0]?.safe) throw new Error("Database not ready");
    return Response.json({ status: "ready" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export const GET = withApi(GETHandler);
