import Link from "next/link";
import { notFound } from "next/navigation";
import EditableArtifact from "@/components/workspace/EditableArtifact";
import TraceBadge from "@/components/workspace/TraceBadge";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { traceEntriesFor } from "@/lib/trace";
import { loadCostContext, loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function StoryPage({
  params,
}: {
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
      parent: { include: { parent: { select: { title: true } } } }, // epic → feature
      children: { where: { type: "acceptance_criterion" }, orderBy: { order: "asc" } },
      sprint: { select: { sprintNumber: true } },
    },
  });
  if (!story || story.type !== "story" || story.prototypeId !== ws.prototype.id) notFound();

  const storiesLocked = ws.isLocked("stories");
  const acLocked = ws.isLocked("acceptance_criteria");
  const cap = story.sourceCapabilityId ? ws.capViewById.get(story.sourceCapabilityId) : null;
  const cost = await loadCostContext(initiativeId, ws.prototype.id);
  const storyCost = (story.points ?? 1) * cost.model.costPerStoryPoint;

  return (
    <div>
      <Link
        href={`/initiatives/${initiativeId}/workspace/epics`}
        className="text-sm text-neutral-500 hover:text-neutral-800"
      >
        ← All epics &amp; stories
      </Link>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {story.parent?.parent?.title} · {story.parent?.title}
      </p>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <EditableArtifact
            artifactId={story.id}
            title={story.title}
            body={story.body}
            points={story.points}
            locked={storiesLocked}
            titleClassName="text-lg font-bold"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {story.externalRef && (
            <span className="rounded bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
              {story.externalRef}
            </span>
          )}
          <TraceBadge
            note={story.traceNote}
            entries={traceEntriesFor(story.traceAnswerKeys, ws.intakeView, cap)}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-500">
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-medium">
          {story.points ?? 1} story points
        </span>
        <span
          className="rounded-full bg-neutral-100 px-2.5 py-1 font-medium"
          title={`Story cost (§19): ${story.points ?? 1} points × $${cost.model.costPerStoryPoint}/point — a planning estimate, not an accounting value.`}
        >
          ~${Math.round(storyCost).toLocaleString()}
        </span>
        {(story.points ?? 1) >= 13 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
            May be too large for one sprint — consider splitting (§9)
          </span>
        )}
        {cap?.riskLevel && (cap.riskLevel === "high" || cap.riskLevel === "critical") && (
          <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-800">
            {cap.riskLevel} risk feature
          </span>
        )}
        {story.sprint && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
            Sprint {story.sprint.sprintNumber}
          </span>
        )}
        {cap && (
          <span className="rounded-full bg-neutral-100 px-2.5 py-1">
            From feature: {cap.name}
          </span>
        )}
      </div>

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-indigo-600">
        Acceptance criteria — waterfall layer 5
      </h3>
      <div className="mt-3 space-y-3">
        {story.children.map((ac) => (
          <div key={ac.id} className="rounded-xl border border-neutral-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <EditableArtifact
                  artifactId={ac.id}
                  title={ac.title}
                  body={ac.body}
                  locked={acLocked}
                  titleClassName="text-sm font-semibold"
                />
              </div>
              <TraceBadge
                note={ac.traceNote}
                entries={traceEntriesFor(ac.traceAnswerKeys, ws.intakeView, cap)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
