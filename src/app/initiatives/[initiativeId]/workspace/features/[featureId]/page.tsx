import Link from "next/link";
import { notFound } from "next/navigation";
import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { requireInitiativeView } from "@/lib/access/guards";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import JiraDeliveryLive from "@/components/jira/JiraDeliveryLive";

export const dynamic = "force-dynamic";

async function FeatureDeliveryPage({ params }: { params: Promise<{ initiativeId: string; featureId: string }> }) {
  const { initiativeId, featureId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  await requireInitiativeView(user, initiativeId);
  const feature = await db.capability.findFirst({ where: { id: featureId, intakeAnswerSet: { initiativeId } }, select: { id: true, name: true, description: true, backlogLane: true, backlogStatus: true, businessValue: true, riskLevel: true } });
  if (!feature) notFound();
  return <div className="space-y-5"><Link href={`/initiatives/${initiativeId}/backlog`} className="text-sm text-indigo-700 underline">Back to feature backlog</Link><div><h1 className="text-2xl font-bold">{feature.name}</h1><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{feature.description}</p></div><section className="rounded-lg border bg-white p-4 text-sm" aria-label="Clarivia feature planning"><h2 className="font-semibold">Clarivia planning</h2><p className="mt-2">Lane: {feature.backlogLane.replaceAll("_", " ")} · Planning status: {feature.backlogStatus.replaceAll("_", " ")}</p><p className="mt-1">Business value: {feature.businessValue.replaceAll("_", " ")} · Risk: {feature.riskLevel.replaceAll("_", " ")}</p></section><JiraDeliveryLive initiativeId={initiativeId} target={{ type: "feature", id: feature.id }} /></div>;
}

export default withAuthenticatedPage(FeatureDeliveryPage);
