import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireInitiativeView } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { featureRecord } from "@/lib/backlog/model";
import { listFeatures } from "@/lib/backlog/service";
import BacklogWorkspace from "@/components/backlog/BacklogWorkspace";
import { ContainedLayout } from "@/components/layout/PageLayouts";

export default async function BacklogPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const access = await requireInitiativeView(user, initiativeId);
  const [initiative, features] = await Promise.all([
    db.initiative.findUnique({ where: { id: initiativeId }, select: { name: true } }),
    listFeatures(initiativeId),
  ]);
  if (!initiative) notFound();
  return <ContainedLayout>
    <div className="mb-6 space-y-2"><Link href={`/initiatives/${initiativeId}/requests`} className="text-sm text-indigo-700">{initiative.name} / Requests & priorities</Link>
      <h1 className="text-3xl font-bold">Product feature backlog</h1>
      <p className="text-slate-500">Create features, maintain their order and status, and organize the roadmap into Now, Next, and Later.</p>
    </div>
    <BacklogWorkspace initiativeId={initiativeId} initialFeatures={features.map(featureRecord)} canEdit={access.level === "edit" || access.level === "owner"} />
  </ContainedLayout>;
}
