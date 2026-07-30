import Link from "next/link";
import { notFound } from "next/navigation";
import ExecutiveReport from "@/components/executive/ExecutiveReport";
import { loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function ExecutivePage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const ws = await loadWorkspace(initiativeId);
  if (!ws) notFound();

  return (
    <div>
      <div className="no-print mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-neutral-500">
          Always current — regenerated from live plan data every time it opens (FR-19).
        </p>
        <Link
          href={`/initiatives/${initiativeId}/workspace/executive/print`}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Download / print
        </Link>
      </div>
      <ExecutiveReport initiativeId={initiativeId} />
    </div>
  );
}
