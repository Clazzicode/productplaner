import { notFound } from "next/navigation";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import DocumentReviewPanel from "@/components/documents/DocumentReviewPanel";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  uploaded: "neutral",
  extracted: "amber",
  analyzed: "emerald",
  failed: "red",
};

/**
 * Directive item 2: "Add Documents" from inside the initiative workspace —
 * complements the intake-time "Import Existing Work" entry point
 * (ProductDirectionBootstrap/PlanningQuestionnaire), which only covers
 * documents uploaded before the plan is generated. Uploads here are always
 * initiative_only (never auto-shared with a sibling initiative); this page
 * also lists this Project's project_shared documents as read-only inherited
 * context, mirroring how Section 2's budget/rate/target-date inheritance
 * already works.
 */
export default async function WorkspaceDocumentsPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const ws = await loadWorkspace(initiativeId);
  if (!ws) notFound();

  const [ownDocuments, sharedDocuments] = await Promise.all([
    db.document.findMany({
      where: { initiativeId },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, status: true, createdAt: true },
    }),
    db.document.findMany({
      where: { projectId: ws.initiative.projectId, initiativeId: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, status: true, createdAt: true },
    }),
  ]);

  return (
    <div>
      <h2 className="text-xl font-bold">Documents</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Upload planning documents specific to this initiative. Project-shared documents (uploaded
        from Project Home) are listed below for reference but stay owned there.
      </p>

      {sharedDocuments.length > 0 && (
        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Inherited from the project
          </h3>
          <ul className="mt-2 space-y-1">
            {sharedDocuments.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2 text-sm text-neutral-600">
                <Badge variant={STATUS_VARIANT[doc.status] ?? "neutral"}>{doc.status}</Badge>
                {doc.fileName}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ownDocuments.length > 0 && (
        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            This initiative&apos;s documents
          </h3>
          <ul className="mt-2 space-y-1">
            {ownDocuments.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2 text-sm text-neutral-600">
                <Badge variant={STATUS_VARIANT[doc.status] ?? "neutral"}>{doc.status}</Badge>
                {doc.fileName}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6">
        <DocumentReviewPanel
          scope="initiative_only"
          projectId={ws.initiative.projectId}
          initiativeId={initiativeId}
          experienceLevel={user.profiles[0]?.experienceLevel}
        />
      </div>
    </div>
  );
}
