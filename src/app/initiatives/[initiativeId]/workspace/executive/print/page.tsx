import Link from "next/link";
import { notFound } from "next/navigation";
import AutoPrint from "@/components/executive/AutoPrint";
import ExecutiveReport from "@/components/executive/ExecutiveReport";
import { loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function ExecutivePrintPage({
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
        <Link
          href={`/initiatives/${initiativeId}/workspace/executive`}
          className="text-sm text-neutral-500 hover:text-neutral-800"
        >
          ← Back to executive view
        </Link>
        <p className="text-sm text-neutral-500">
          Print dialog opens automatically — choose “Save as PDF” to download.
        </p>
      </div>
      <AutoPrint />
      <ExecutiveReport initiativeId={initiativeId} />
    </div>
  );
}
