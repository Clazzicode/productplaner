import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, riskBadgeVariant } from "@/components/ui/Badge";
import CoachMark from "@/components/coachmarks/CoachMark";
import AiAssistPanel from "@/components/ai/AiAssistPanel";
import EditableArtifact from "@/components/workspace/EditableArtifact";
import ExplainBadge from "@/components/workspace/ExplainBadge";
import TraceBadge from "@/components/workspace/TraceBadge";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import type { RiskLevel } from "@/lib/generation/types";
import { riskLevelGuidance } from "@/lib/questionnaire/valueRiskGuidance";
import { traceEntriesFor } from "@/lib/trace";
import { loadCostContext, loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function FeaturesPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const ws = await loadWorkspace(initiativeId);
  if (!ws) notFound();
  const cost = await loadCostContext(initiativeId, ws.prototype.id);

  const phases = await db.artifactLayer.findMany({
    where: { prototypeId: ws.prototype.id, type: "roadmap_phase" },
    orderBy: { order: "asc" },
    include: {
      children: {
        where: { type: "feature" },
        orderBy: { order: "asc" },
        include: { children: { where: { type: "epic" }, select: { id: true } } },
      },
    },
  });

  return (
    <div>
      <h2 className="text-xl font-bold">Feature hierarchy</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Each feature from intake appears once here, grouped by roadmap phase.
      </p>
      <CoachMark coachMarkKey="planning_workspace" className="mt-4" />

      <div className="mt-6 space-y-6">
        {phases.map((phase) => (
          <section key={phase.id}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              {phase.title}
            </h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {phase.children.map((feature) => {
                const cap = feature.sourceCapabilityId
                  ? ws.capViewById.get(feature.sourceCapabilityId)
                  : null;
                return (
                  <div key={feature.id} className="rounded-xl border border-neutral-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <EditableArtifact
                          artifactId={feature.id}
                          title={feature.title}
                          body={feature.body}
                        />
                      </div>
                      <TraceBadge
                        note={feature.traceNote}
                        entries={traceEntriesFor(feature.traceAnswerKeys, ws.intakeView, cap)}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                      {cap?.isMvp && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-700">
                          MVP
                        </span>
                      )}
                      {cap && (
                        <span>
                          Effort {cap.effortSize.toUpperCase()} · Value{" "}
                          {cap.businessValue.replace("_", " ")}
                        </span>
                      )}
                      {cap?.riskLevel && (
                        <Badge
                          variant={riskBadgeVariant(cap.riskLevel)}
                          title={riskLevelGuidance(cap.riskLevel as RiskLevel, false)}
                        >
                          risk {cap.riskLevel}
                        </Badge>
                      )}
                      {feature.sourceCapabilityId &&
                        cost.priorityByCapability.has(feature.sourceCapabilityId) && (
                          <span className="inline-flex items-center gap-1">
                            Priority {cost.priorityByCapability.get(feature.sourceCapabilityId)!.toFixed(2)}
                            {cost.priorityExplanationByCapability.has(feature.sourceCapabilityId) && (
                              <ExplainBadge
                                explanation={cost.priorityExplanationByCapability.get(feature.sourceCapabilityId)!}
                              />
                            )}
                          </span>
                        )}
                      {feature.sourceCapabilityId &&
                        cost.costByCapability.has(feature.sourceCapabilityId) && (
                          <span className="font-medium text-neutral-700">
                            ~$
                            {Math.round(
                              cost.costByCapability.get(feature.sourceCapabilityId)!,
                            ).toLocaleString()}
                          </span>
                        )}
                      <Link
                        href={`/initiatives/${initiativeId}/workspace/epics`}
                        className="text-indigo-600 hover:underline"
                      >
                        {feature.children.length} epic{feature.children.length === 1 ? "" : "s"} →
                      </Link>
                    </div>
                    {cap && cap.dependsOnNames.length > 0 && (
                      <p className="mt-2 text-xs text-amber-700">
                        Depends on: {cap.dependsOnNames.join(", ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Secondary to the feature hierarchy above (Section 4). */}
      <div className="mt-8 max-w-xl">
        <AiAssistPanel initiativeId={initiativeId} scope="features" />
      </div>
    </div>
  );
}
