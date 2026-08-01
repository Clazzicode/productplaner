import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfile, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { LAYER_SEQUENCE } from "@/lib/generation/types";

export const dynamic = "force-dynamic";

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-neutral-100 text-neutral-600" },
  intake_in_progress: { label: "Intake in progress", cls: "bg-amber-100 text-amber-800" },
  generated: { label: "Prototype live", cls: "bg-emerald-100 text-emerald-800" },
};

export default async function HomePage() {
  const profile = await getActiveProfile();
  if (!profile) redirect("/welcome");
  const user = await getCurrentUser();

  const initiatives = await db.initiative.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      prototype: { include: { layerLocks: true } },
      syncConnections: true,
    },
  });

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Guided Product Planning Platform
          </p>
          <h1 className="mt-1 text-2xl font-bold">Your initiatives</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Plan structural status at a glance. Live plan-health against delivery actuals
            arrives with the v1.1 living-plan release.
          </p>
        </div>
        <Link
          href="/initiatives/new"
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + New initiative
        </Link>
      </div>

      {initiatives.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <h2 className="text-lg font-semibold">No initiatives yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
            Create one, answer the eight guided planning questions, and get a working
            prototype of a complete product plan — roadmap to sprint-ready stories.
          </p>
          <Link
            href="/initiatives/new"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Start your first plan
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {initiatives.map((initiative) => {
            const locks = initiative.prototype?.layerLocks ?? [];
            const lockedCount = locks.filter((l) => l.state === "locked").length;
            const badge = STATUS_BADGES[initiative.status] ?? STATUS_BADGES.draft;
            const jira = initiative.syncConnections.find((c) => c.tool === "jira");
            const href =
              initiative.status === "generated"
                ? `/initiatives/${initiative.id}/dashboard`
                : `/initiatives/${initiative.id}/intake`;
            return (
              <li key={initiative.id}>
                <Link
                  href={href}
                  className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="font-semibold">{initiative.name}</h2>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  {initiative.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
                      {initiative.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                    {initiative.prototype && (
                      <span>
                        <span className="font-medium text-neutral-700">
                          {lockedCount}/{LAYER_SEQUENCE.length}
                        </span>{" "}
                        waterfall layers locked
                      </span>
                    )}
                    {initiative.prototype?.approvedAt && (
                      <span className="text-emerald-700">Baseline approved</span>
                    )}
                    {jira?.status === "connected" && (
                      <span className="text-indigo-600">
                        Jira {jira.lastSyncedAt ? "synced" : "connected"} (demo)
                      </span>
                    )}
                    <span>Methodology: hybrid waterfall</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
