import Link from "next/link";
import { redirect } from "next/navigation";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { getActiveProfile, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "neutral" },
  intake_in_progress: { label: "Intake in progress", variant: "amber" },
  generated: { label: "Prototype live", variant: "emerald" },
};

/**
 * ADMIN -> Access (docs/V2-ORG-ADMIN-IA.md §2/§9/§21): the org-wide entry
 * point into the exact same InitiativeAccess data as the initiative-centric
 * "Who Has Access?" link and Team Detail's grants — pick an initiative here,
 * land on /admin/access/[initiativeId], which is the one real management
 * screen regardless of how you arrived.
 */
export default async function AdminAccessPage() {
  const profile = await getActiveProfile();
  if (!profile) redirect("/welcome");
  const user = await getCurrentUser();
  if (user.accessLevel !== "org_admin") redirect("/home");

  const initiatives = await db.initiative.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true, _count: { select: { initiativeAccess: true } } },
  });

  return (
    <ContainedLayout className="max-w-4xl">
      <PageHeader
        eyebrow="Admin"
        title="Access"
        description="Choose an initiative to see and manage who has access to it."
      />
      <div className="mt-6">
        {initiatives.length === 0 ? (
          <EmptyState title="No initiatives yet" description="Access management appears once an initiative exists." />
        ) : (
          <ul className="space-y-2">
            {initiatives.map((i) => {
              const status = STATUS_META[i.status] ?? STATUS_META.draft;
              return (
                <li key={i.id}>
                  <Link
                    href={`/admin/access/${i.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow"
                  >
                    <span className="font-semibold text-text-primary">{i.name}</span>
                    <span className="flex items-center gap-3 text-xs text-text-muted">
                      {i._count.initiativeAccess} {i._count.initiativeAccess === 1 ? "grant" : "grants"}
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ContainedLayout>
  );
}
