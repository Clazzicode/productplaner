import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { readOnboardingStateServer } from "@/lib/onboarding/tempStateServer";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profiles.length > 0) redirect("/home");

  // First-time session: walk through Step 4 onboarding (org + working role)
  // before the existing guided qualifying questionnaire. See docs/V2-ONBOARDING.md.
  const onboarding = await readOnboardingStateServer();
  redirect(onboarding.complete ? "/welcome" : "/onboarding");
}
