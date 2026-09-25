import { withApi } from "@/lib/observability";
async function GETHandler() {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}

export const GET = withApi(GETHandler, { diagnostic: true });
