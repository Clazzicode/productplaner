import Link from "next/link";
import { notFound } from "next/navigation";
import EditableArtifact from "@/components/workspace/EditableArtifact";
import TraceBadge from "@/components/workspace/TraceBadge";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { traceEntriesFor } from "@/lib/trace";
import { loadCostContext, loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function EpicsPage({
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

  const features = await db.artifactLayer.findMany({
    where: { prototypeId: ws.prototype.id, type: "feature" },
    orderBy: { order: "asc" },
    include: {
      parent: { select: { title: true, order: true } },
      children: {
        where: { type: "epic" },
        orderBy: { order: "asc" },
        include: {
          children: {
            where: { type: "story" },
            orderBy: { order: "asc" },
            include: { sprint: { select: { sprintNumber: true } } },
          },
        },
      },
    },
  });
  features.sort(
    (a, b) => (a.parent?.order ?? 0) - (b.parent?.order ?? 0) || a.order - b.order,
  );

  return (
    <div>
      <h2 className="text-xl font-bold">Epics &amp; user stories</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Edit an epic's title or description directly — open a story for its acceptance criteria.
      </p>

      <div className="mt-6 space-y-8">
        {features.map((feature) => (
          <section key={feature.id}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              {feature.parent?.title} · <span className="text-indigo-600">{feature.title}</span>
            </h3>
            <div className="mt-2 space-y-3">
              {feature.children.map((epic) => {
                const cap = epic.sourceCapabilityId
                  ? ws.capViewById.get(epic.sourceCapabilityId)
                  : null;
                return (
                  <div key={epic.id} className="rounded-xl border border-neutral-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-[140px] flex-1">
                        <EditableArtifact
                          artifactId={epic.id}
                          title={epic.title}
                          body={epic.body}
                        />
                      </div>
                      <div className="flex flex-wrap shrink-0 items-center gap-2">
                        <span
                          className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600"
                          title="Epic cost: sum of its story costs (§20)"
                        >
                          ~$
                          {Math.round(
                            epic.children.reduce((n, s) => n + (s.points ?? 1), 0) *
                              cost.model.costPerStoryPoint,
                          ).toLocaleString()}
                        </span>
                        {epic.externalRef && (
                          <span className="rounded bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                            {epic.externalRef}
                          </span>
                        )}
                        <TraceBadge
                          note={epic.traceNote}
                          entries={traceEntriesFor(epic.traceAnswerKeys, ws.intakeView, cap)}
                        />
                      </div>
                    </div>
                    <ul className="mt-3 divide-y divide-neutral-100 border-t border-neutral-100">
                      {epic.children.map((story) => (
                        <li key={story.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                          <Link
                            href={`/initiatives/${initiativeId}/workspace/stories/${story.id}`}
                            className="min-w-[120px] flex-1 truncate text-sm text-neutral-700 hover:text-indigo-700 hover:underline"
                          >
                            {story.title}
                          </Link>
                          <span className="flex flex-wrap shrink-0 items-center gap-2 text-xs text-neutral-400">
                            {story.externalRef && (
                              <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800">
                                {story.externalRef}
                              </span>
                            )}
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium">
                              {story.points ?? 1} pts · $
                              {Math.round(
                                (story.points ?? 1) * cost.model.costPerStoryPoint,
                              ).toLocaleString()}
                            </span>
                            {(story.points ?? 1) >= 13 && (
                              <span
                                className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"
                                title="This story may be too large for a sprint and should be split (§9)."
                              >
                                split?
                              </span>
                            )}
                            {story.sprint && <span>Sprint {story.sprint.sprintNumber}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
