import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireInitiativeView } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { featureRecord } from "@/lib/backlog/model";
import { listFeatures } from "@/lib/backlog/service";\nimport { listUnifiedBacklog } from "@/lib/backlog/unified";
import BacklogWorkspace from "@/components/backlog/BacklogWorkspace";
import { ContainedLayout } from "@/components/layout/PageLayouts";

export default async function BacklogPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const access = await requireInitiativeView(user, initiativeId);
  const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { name: true, organizationId: true } });
  if (!initiative) notFound();
  const [features, owners, items] = await Promise.all([
    listFeatures(initiativeId),
    db.user.findMany({
      where: { status: "active", memberships: { some: { organizationId: initiative.organizationId, status: "active" } } },
      select: { id: true, name: true, email: true }, orderBy: [{ name: "asc" }, { id: "asc" }],
    }),\n    listUnifiedBacklog(initiativeId),\n  ]);
  return <ContainedLayout>
    <div className="mb-6 space-y-2"><Link href={`/initiatives/${initiativeId}/requests`} className="text-sm text-indigo-700">{initiative.name} / Requests & priorities</Link>
      <h1 className="text-3xl font-bold">Product feature backlog</h1>
      <p className="text-slate-500">Maintain each feature’s purpose, owner, MVP scope, value, risk, dependencies, lifecycle, and originating request.</p>
    </div>
    <BacklogWorkspace initiativeId={initiativeId} initialFeatures={features.map(featureRecord)} initialItems={items} owners={owners} canEdit={access.level === "edit" || access.level === "owner"} />
  </ContainedLayout>;
}
