import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import JiraSyncPanel from "@/components/workspace/JiraSyncPanel";
import LockBar from "@/components/workspace/LockBar";
import NavTabs from "@/components/workspace/NavTabs";
import RefreshBar from "@/components/workspace/RefreshBar";
import { db } from "@/lib/db";
import { profileFor, resolveMethodology } from "@/lib/generation/methodology";
import { artifactCounts, loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const ws = await loadWorkspace(initiativeId);
  if (!ws) {
    const initiative = await db.initiative.findUnique({ where: { id: initiativeId } });
    if (!initiative) notFound();
    redirect(`/initiatives/${initiativeId}/intake`);
  }
  const counts = await artifactCounts(ws.prototype.id);
  const methodology = resolveMethodology(ws.initiative.methodology);
  const profile = profileFor(ws.initiative.methodology);

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <header className="no-print">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/home" className="text-sm text-neutral-500 hover:text-neutral-800">
              ← Initiatives
            </Link>
            <h1 className="mt-1 text-2xl font-bold">{ws.initiative.name}</h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              Working prototype · {profile.label} ·{" "}
              <Link
                href={`/initiatives/${initiativeId}/intake`}
                className="text-indigo-600 hover:underline"
              >
                view intake answers
              </Link>
              {ws.prototype.approvedAt && (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  Baseline approved {new Date(ws.prototype.approvedAt).toLocaleDateString()}
                </span>
              )}
            </p>
          </div>
          <JiraSyncPanel
            initiativeId={initiativeId}
            status={ws.jira?.status ?? "not_connected"}
            lastSyncedAt={ws.jira?.lastSyncedAt?.toISOString() ?? null}
          />
        </div>
        <div className="mt-5">
          <LockBar
            initiativeId={initiativeId}
            locks={ws.locks.map((l) => ({
              layerType: l.layerType,
              state: l.state,
              everLocked: l.everLocked,
            }))}
            counts={counts}
            methodology={methodology}
          />
          <RefreshBar
            initiativeId={initiativeId}
            locks={ws.locks.map((l) => ({ layerType: l.layerType, state: l.state }))}
          />
        </div>
        <div className="mt-5">
          <NavTabs initiativeId={initiativeId} methodology={methodology} />
        </div>
      </header>
      <main className="rounded-b-2xl rounded-tr-2xl border border-t-0 border-neutral-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
        {children}
      </main>
    </div>
  );
}
