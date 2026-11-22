import ConnectionWelcome from "@/components/onboarding/ConnectionWelcome";
import { withAuthenticatedPage } from "@/lib/auth/entryPoints";

export const dynamic = "force-dynamic";

async function ConnectionWelcomePage() {
  return <ConnectionWelcome connected={[]} />;
}

export default withAuthenticatedPage(ConnectionWelcomePage);
