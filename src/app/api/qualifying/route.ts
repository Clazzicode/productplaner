import { withAuthenticatedApi } from "@/lib/auth/entryPoints";

/** Historical profiles remain readable for compatibility, never recalibrated. */
async function retired() {
  return Response.json({ error: "Experience evaluation has been retired. Open initiative planning to continue.", continueTo: "/initiatives/new" }, { status: 410 });
}
export const POST = withAuthenticatedApi(retired);
export const PATCH = withAuthenticatedApi(retired);
