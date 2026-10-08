import Link from "next/link";
import { notFound } from "next/navigation";
import AcceptanceCriterionEditor from "@/components/workspace/AcceptanceCriterionEditor";
import StoryDetailsEditor from "@/components/workspace/StoryDetailsEditor";
import StoryWorkflowControls from "@/components/workspace/StoryWorkflowControls";
import TraceBadge from "@/components/workspace/TraceBadge";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import {\n  acceptanceCriterionAdequacy,\n  listAcceptanceCriterionHistory,\n  listStoryHistory,\n  storyReadiness,\n} from "@/lib/stories/service";
import { traceEntriesFor } from "@/lib/trace";
import { loadCostContext, loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function StoryPage({ params }: {
  params: Promise<{ initiativeId: string; storyId: string }>;
}) {
  const { initiativeId, storyId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const ws = await loadWorkspace(initiativeId);
  if (!ws) notFound();

  const story = await db.artifactLayer.findUnique({
    where: { id: storyId },
    include: {
      parent: { include: { parent: { select: { title: true } } } },
      children: {
        where: { type: "acceptance_criterion" },
        orderBy: { order: "asc" },
        include: { revisions: { orderBy: { version: "desc" } } },
      },
      sprint: { select: { sprintNumber: true } },
    },
  });
  if (!story || story.type !== "story" || story.prototypeId !== ws.prototype.id) notFound();

  const [cost, epics, history] = await Promise.all([
    loadCostContext(initiativeId, ws.prototype.id),
    db.artifactLayer.findMany({
      where: { prototypeId: ws.prototype.id, type: "epic", parent: { type: "feature" }, archivedAt: null },
      orderBy: { order: "asc" },
      select: { id: true, title: true, parent: { select: { title: true } } },
    }),
    listStoryHistory(initiativeId, story.id),
  ]);
  const criterionHistoryEntries = await Promise.all(\n    story.children.map(async (criterion) => [\n      criterion.id,\n      await listAcceptanceCriterionHistory(initiativeId, criterion.id),\n    ] as const),\n  );\n  const criterionHistory = new Map(criterionHistoryEntries);\n  const activeCriteria = story.children.filter((criterion) => !criterion.archivedAt);\n  const cap = story.sourceCapabilityId ? ws.capViewById.get(story.sourceCapabilityId) : null;
  const storyCost = (story.points ?? 1) * cost.model.costPerStoryPoint;
  const readiness = storyReadiness({
    title: story.title,
    body: story.body,
    points: story.points,
    readinessStatus: story.readinessStatus,
    criteria: activeCriteria,
  });
  const archived = Boolean(story.archivedAt);

  return (
    <div>
      <Link href={`/initiatives/${initiativeId}/workspace/epics`} className="text-sm text-neutral-500 hover:text-neutral-800">
        ← All epics &amp; stories
      </Link>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {story.parent?.parent?.title} · {story.parent?.title}
      </p>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <StoryDetailsEditor
            initiativeId={initiativeId}
            story={{
              id: story.id,
              title: story.title,
              body: story.body,
              points: story.points,
              readinessStatus: story.readinessStatus,
              parentId: story.parentId!,
              backlogRevision: story.backlogRevision,
              archived,
            }}
            epics={epics.map((epic) => ({
              id: epic.id,
              label: `${epic.parent?.title ?? "Feature"} · ${epic.title}`,
            }))}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {archived && <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Archived</span>}
          {story.externalRef && <span className="rounded bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">{story.externalRef}</span>}
          <TraceBadge note={story.traceNote} entries={traceEntriesFor(story.traceAnswerKeys, ws.intakeView, cap)} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-500">
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-medium">{story.points ?? 1} story points</span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-medium" title={`Story cost: ${story.points ?? 1} points × $${cost.model.costPerStoryPoint}/point — a planning estimate.`}>
          ~{Math.round(storyCost).toLocaleString()}
        </span>
        {(story.points ?? 1) >= 13 && <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">May be too large for one sprint — consider splitting</span>}
        {story.sprint && <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">Sprint {story.sprint.sprintNumber}</span>}
        {cap && <span className="rounded-full bg-neutral-100 px-2.5 py-1">From feature: {cap.name}</span>}
        <span className={`rounded-full px-2.5 py-1 font-medium ${readiness.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {readiness.ready ? "Content complete" : `${readiness.gaps.length} readiness gaps`}
        </span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-medium capitalize">Source: {story.sourceType}</span>
      </div>

      {!archived && !readiness.ready && (
        <ul className="mt-3 list-disc rounded-lg bg-amber-50 p-4 pl-8 text-sm text-amber-900">
          {readiness.gaps.map((gap) => <li key={gap}>{gap}</li>)}
        </ul>
      )}

      {!archived && (
        <StoryWorkflowControls
          initiativeId={initiativeId}
          storyId={story.id}
          backlogRevision={story.backlogRevision}
          readinessStatus={story.readinessStatus}
          criteria={activeCriteria.map((criterion) => ({
            id: criterion.id,
            title: criterion.title,
            approved: Boolean(criterion.approvedAt),
          }))}
        />
      )}

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-indigo-600">Acceptance criteria</h3>
      <div className="mt-3 space-y-3">
        {story.children.length === 0 && <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">No acceptance criteria have been added.</p>}
        {story.children.map((criterion) => (
          <div key={criterion.id} className="rounded-xl border border-neutral-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {archived ? (
                  <>
                    <h4 className="text-sm font-semibold">{criterion.title}</h4>
                    <p className="mt-1 text-sm text-neutral-600">{criterion.body}</p>
                  </>
                ) : (
                  <AcceptanceCriterionEditor
                    initiativeId={initiativeId}
                    criterion={{
                      id: criterion.id,
                      title: criterion.title,
                      body: criterion.body,
                      backlogRevision: criterion.backlogRevision,
                      approved: Boolean(criterion.approvedAt),
                      archived: Boolean(criterion.archivedAt),
                    }}
                    adequacyGaps={acceptanceCriterionAdequacy(criterion).gaps}
                    history={criterionHistory.get(criterion.id) ?? []}
                  />
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {criterion.archivedAt && <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Archived</span>}
                {criterion.approvedAt && <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Approved</span>}
                <TraceBadge note={criterion.traceNote} entries={traceEntriesFor(criterion.traceAnswerKeys, ws.intakeView, cap)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="mt-8 rounded-xl border border-neutral-200 p-4">
        <h3 className="text-sm font-semibold">Story change history</h3>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No edits, reassignment, readiness changes, or archive actions have been recorded yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {history.map((revision) => (
              <li key={revision.id} className="border-l-2 border-indigo-200 pl-3 text-sm">
                <p className="font-medium">Version {revision.version} · {revision.reason}</p>
                <p className="text-xs text-neutral-500">
                  {new Date(revision.createdAt).toLocaleString()} · {revision.actor?.name ?? revision.actor?.email ?? "System"}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
