import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import AiAssistPanel from "@/components/ai/AiAssistPanel";
import EditableArtifact from "@/components/workspace/EditableArtifact";
import StoryCreateForm from "@/components/workspace/StoryCreateForm";
import StoryFilters from "@/components/workspace/StoryFilters";
import StorySuggestionButton from "@/components/workspace/StorySuggestionButton";
import TraceBadge from "@/components/workspace/TraceBadge";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { traceEntriesFor } from "@/lib/trace";
import { loadCostContext, loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const sources = new Set(["manual", "ai", "split", "generated", "jira"]);
const readinessStates = new Set(["needs_refinement", "ready_for_refinement", "sprint_ready", "blocked", "split"]);

export default async function EpicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ initiativeId: string }>;
  searchParams: Promise<{ feature?: string; source?: string; readiness?: string; archive?: string }>;
}) {
  const { initiativeId } = await params;
  const filters = await searchParams;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const ws = await loadWorkspace(initiativeId);
  if (!ws) notFound();
  const cost = await loadCostContext(initiativeId, ws.prototype.id);

  const source = filters.source && sources.has(filters.source) ? filters.source : undefined;
  const readiness = filters.readiness && readinessStates.has(filters.readiness) ? filters.readiness : undefined;
  const archive = filters.archive === "archived" || filters.archive === "all" ? filters.archive : "active";
  const storyWhere: Prisma.ArtifactLayerWhereInput = {
    type: "story",
    ...(source ? { sourceType: source } : {}),
    ...(readiness ? { readinessStatus: readiness } : {}),
    ...(archive === "active"
      ? { archivedAt: null }
      : archive === "archived"
        ? { archivedAt: { not: null } }
        : {}),
  };

  const allFeatures = await db.artifactLayer.findMany({
    where: { prototypeId: ws.prototype.id, type: "feature" },
    orderBy: { order: "asc" },
    include: {
      parent: { select: { title: true, order: true } },
      children: {
        where: { type: "epic", archivedAt: null },
        orderBy: { order: "asc" },
        include: {
          children: {
            where: storyWhere,
            orderBy: { order: "asc" },
            include: { sprint: { select: { sprintNumber: true } } },
          },
        },
      },
    },
  });
  allFeatures.sort((a, b) => (a.parent?.order ?? 0) - (b.parent?.order ?? 0) || a.order - b.order);
  const features = filters.feature ? allFeatures.filter((feature) => feature.id === filters.feature) : allFeatures;
  const storyCount = features.reduce(
    (total, feature) => total + feature.children.reduce((featureTotal, epic) => featureTotal + epic.children.length, 0),
    0,
  );

  return (
    <div>
      <h2 className="text-xl font-bold">Epics &amp; user stories</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Manage stories under their feature, then open one to edit, reassign, archive, split, or review its history.
      </p>

      <StoryFilters features={allFeatures.map((feature) => ({ id: feature.id, label: feature.title }))} />

      {storyCount === 0 && (
        <p className="mt-5 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm text-neutral-600">
          No stories match these filters. Change a filter or add a manual story under an epic.
        </p>
      )}

      <div className="mt-6 space-y-8">
        {features.map((feature) => (
          <section key={feature.id}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              {feature.parent?.title} · <span className="text-indigo-600">{feature.title}</span>
            </h3>
            {archive !== "archived" && <StorySuggestionButton initiativeId={initiativeId} featureId={feature.id} />}
            <div className="mt-2 space-y-3">
              {feature.children.map((epic) => {
                const cap = epic.sourceCapabilityId ? ws.capViewById.get(epic.sourceCapabilityId) : null;
                return (
                  <div key={epic.id} className="rounded-xl border border-neutral-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-[140px] flex-1">
                        <EditableArtifact artifactId={epic.id} title={epic.title} body={epic.body} />
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600" title="Epic cost is the sum of its visible story costs.">
                          ~{Math.round(epic.children.reduce((total, story) => total + (story.points ?? 1), 0) * cost.model.costPerStoryPoint).toLocaleString()}
                        </span>
                        {epic.externalRef && <span className="rounded bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">{epic.externalRef}</span>}
                        <TraceBadge note={epic.traceNote} entries={traceEntriesFor(epic.traceAnswerKeys, ws.intakeView, cap)} />
                      </div>
                    </div>
                    {epic.children.length === 0 ? (
                      <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-400">
                        No stories in this epic match the current filters.
                      </p>
                    ) : (
                      <ul className="mt-3 divide-y divide-neutral-100 border-t border-neutral-100">
                        {epic.children.map((story) => (
                          <li key={story.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                            <Link href={`/initiatives/${initiativeId}/workspace/stories/${story.id}`} className="min-w-[120px] flex-1 truncate text-sm text-neutral-700 hover:text-indigo-700 hover:underline">
                              {story.title}
                            </Link>
                            <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-neutral-400">
                              {story.archivedAt && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Archived</span>}
                              {story.externalRef && <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800">{story.externalRef}</span>}
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium capitalize text-indigo-700">{story.readinessStatus.replaceAll("_", " ")}</span>
                              <span className="capitalize">{story.sourceType}</span>
                              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium">
                                {story.points ?? 1} pts · {Math.round((story.points ?? 1) * cost.model.costPerStoryPoint).toLocaleString()}
                              </span>
                              {(story.points ?? 1) >= 13 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800" title="This story may be too large for a sprint and should be split.">split?</span>}
                              {story.sprint && <span>Sprint {story.sprint.sprintNumber}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {archive !== "archived" && <StoryCreateForm initiativeId={initiativeId} epicId={epic.id} />}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-8"><AiAssistPanel initiativeId={initiativeId} scope="features" /></div>
    </div>
  );
}
