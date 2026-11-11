import Link from "next/link";
import { notFound } from "next/navigation";
import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { requireInitiativeView } from "@/lib/access/guards";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import JiraDeliveryLive from "@/components/jira/JiraDeliveryLive";

export const dynamic = "force-dynamic";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const value = (input: unknown) => typeof input === "string" ? input : "";

async function BugDeliveryPage({ params }: { params: Promise<{ initiativeId: string; bugId: string }> }) {
  const { initiativeId, bugId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  await requireInitiativeView(user, initiativeId);
  const bug = await db.bugPlanningRecord.findFirst({ where: { id: bugId, initiativeId }, include: { request: { select: { data: true } } } });
  if (!bug) notFound();
  const request = object(bug.request.data);
  const details = object(request.bug);
  return <div className="space-y-5"><Link href={`/initiatives/${initiativeId}/workspace/refinement`} className="text-sm text-indigo-700 underline">Back to refinement</Link><div><h1 className="text-2xl font-bold">{value(request.title) || "Planning bug"}</h1><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{value(request.problem)}</p></div><section className="rounded-lg border bg-white p-4 text-sm" aria-label="Clarivia bug planning"><h2 className="font-semibold">Clarivia planning</h2><p className="mt-2">Planning status: {bug.status.replaceAll("_", " ")} · Severity: {bug.severity} · Product priority: {bug.priority}</p><p className="mt-1">Environment: {bug.environment}</p>{value(details.observedBehavior) && <p className="mt-2">Observed: {value(details.observedBehavior)}</p>}{value(details.expectedBehavior) && <p className="mt-1">Expected: {value(details.expectedBehavior)}</p>}</section><JiraDeliveryLive initiativeId={initiativeId} target={{ type: "bug", id: bug.id }} /></div>;
}

export default withAuthenticatedPage(BugDeliveryPage);
