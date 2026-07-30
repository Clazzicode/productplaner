import Link from "next/link";
import { notFound } from "next/navigation";
import EditableArtifact from "@/components/workspace/EditableArtifact";
import TraceBadge from "@/components/workspace/TraceBadge";
import { db } from "@/lib/db";
import { traceEntriesFor } from "@/lib/trace";
import { loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function EpicsPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const ws = await loadWorkspace(initiativeId);
  if (!ws) notFound();
  const epicsLocked = ws.isLocked("epics");

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
        Waterfall layers 3 and 4. Epic edits propagate into regenerated stories on re-lock;
        open a story for its acceptance criteria.
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
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <EditableArtifact
                          artifactId={epic.id}
                          title={epic.title}
                          body={epic.body}
                          locked={epicsLocked}
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
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
                        <li key={story.id} className="flex items-center justify-between gap-3 py-2">
                          <Link
                            href={`/initiatives/${initiativeId}/workspace/stories/${story.id}`}
                            className="min-w-0 flex-1 text-sm text-neutral-700 hover:text-indigo-700 hover:underline"
                          >
                            {story.title}
                          </Link>
                          <span className="flex shrink-0 items-center gap-2 text-xs text-neutral-400">
                            {story.externalRef && (
                              <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800">
                                {story.externalRef}
                              </span>
                            )}
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium">
                              {story.points ?? 1} pts
                            </span>
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
