import { withApi } from "@/lib/observability";
import { rawDb } from "@/lib/db";
import { environmentIsolation } from "@/lib/environment";

async function GETHandler() {
  try {
    const environment = environmentIsolation();
    if (!environment.isolated) {
      return Response.json(
        { status: "unavailable", checks: { database: "unknown", environmentIsolation: "failed" } },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
    const rows = await rawDb.$queryRaw<{ safe: boolean }[]>`
      SELECT NOT (rolsuper OR rolbypassrls) AND current_user = 'app_rw'
        AND to_regclass('public."PlanApproval"') IS NOT NULL
        AND to_regclass('public."AuditEvent"') IS NOT NULL AS safe
      FROM pg_roles WHERE rolname = current_user`;
    if (!rows[0]?.safe) throw new Error("Database not ready");
    return Response.json(
      { status: "ready", checks: { database: "ready", environmentIsolation: "ready" } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable", checks: { database: "failed", environmentIsolation: "unknown" } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export const GET = withApi(GETHandler);
