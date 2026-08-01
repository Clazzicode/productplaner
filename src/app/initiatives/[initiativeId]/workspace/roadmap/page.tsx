import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";
import EditableArtifact from "@/components/workspace/EditableArtifact";
import TraceBadge from "@/components/workspace/TraceBadge";
import { db } from "@/lib/db";
import { traceEntriesFor } from "@/lib/trace";
import { loadCostContext, loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const parse = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export default async function RoadmapPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const ws = await loadWorkspace(initiativeId);
  if (!ws) notFound();
  const locked = ws.isLocked("roadmap");
  const cost = await loadCostContext(initiativeId, ws.prototype.id);

  const root = await db.artifactLayer.findFirst({
    where: { prototypeId: ws.prototype.id, type: "roadmap" },
  });
  const phases = await db.artifactLayer.findMany({
    where: { prototypeId: ws.prototype.id, type: "roadmap_phase" },
    orderBy: { order: "asc" },
    include: { children: { where: { type: "feature" }, orderBy: { order: "asc" } } },
  });
  if (!root) notFound();

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <EditableArtifact
            artifactId={root.id}
            title={root.title}
            body={root.body}
            locked={locked}
            titleClassName="text-xl font-bold"
          />
        </div>
        <TraceBadge
          note={root.traceNote}
          entries={traceEntriesFor(root.traceAnswerKeys, ws.intakeView)}
        />
      </div>

      <div className="mt-8 space-y-4">
        {phases.map((phase) => {
          const content = parse(phase.contentJson);
          const start = content.startDate ? new Date(content.startDate as string) : null;
          const end = content.endDate ? new Date(content.endDate as string) : null;
          const phaseCost = phase.children.reduce(
            (n, f) =>
              n + (f.sourceCapabilityId ? (cost.costByCapability.get(f.sourceCapabilityId) ?? 0) : 0),
            0,
          );
          return (
            <section
              key={phase.id}
              className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <EditableArtifact
                    artifactId={phase.id}
                    title={phase.title}
                    body={phase.body}
                    locked={locked}
                    titleClassName="text-lg font-semibold text-indigo-900"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {phaseCost > 0 && (
                    <span
                      className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-600"
                      title="Sum of this phase's capability costs (§25) — story points × cost per point"
                    >
                      ~${Math.round(phaseCost).toLocaleString()}
                    </span>
                  )}
                  {start && end && (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-600">
                      {format(start, "MMM d")} → {format(end, "MMM d, yyyy")}
                    </span>
                  )}
                  <TraceBadge
                    note={phase.traceNote}
                    entries={traceEntriesFor(phase.traceAnswerKeys, ws.intakeView)}
                  />
                </div>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {phase.children.map((feature) => (
                  <li key={feature.id}>
                    <Link
                      href={`/initiatives/${initiativeId}/workspace/features`}
                      className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-indigo-300"
                    >
                      {feature.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        Roadmap is waterfall layer 1 of 5 — it must lock before the Feature Hierarchy can.
        Phase date ranges are computed from the sprint plan (the FR-07 dual capacity mapping).
      </p>
    </div>
  );
}
