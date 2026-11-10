import ConnectionWelcome from "@/components/onboarding/ConnectionWelcome";
import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

export const dynamic = "force-dynamic";
async function ConnectionWelcomePage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const connections = await db.personalIntegrationConnection.findMany({ where: { userId: user.id, organizationId: user.organizationId }, select: { provider: true } });
  return <ConnectionWelcome connected={connections.map(connection => connection.provider)} />;
}
export default withAuthenticatedPage(ConnectionWelcomePage);
