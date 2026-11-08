import AcceptWorkspaceInvitation from "@/components/workspace/AcceptWorkspaceInvitation";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join a workspace | Clarivia", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function JoinWorkspacePage() {
  const user = await getCurrentUser();
  return <div className="min-h-screen bg-neutral-50 px-5 py-10">
    <AcceptWorkspaceInvitation signedIn={Boolean(user)} email={user?.email} />
  </div>;
}
