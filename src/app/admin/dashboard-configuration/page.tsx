import Link from "next/link";
import { redirect } from "next/navigation";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import PageHeader from "@/components/ui/PageHeader";
import DashboardConfigEditor from "@/components/admin/DashboardConfigEditor";
import { getActiveProfile, getCurrentUser } from "@/lib/auth/session";
import { getRoleConfigurationView } from "@/lib/dashboard/dashboardConfiguration";
import { WORKING_ROLE_LABELS } from "@/lib/admin/labels";
import type { WorkingRole } from "@/lib/onboarding/types";

export const dynamic = "force-dynamic";

const WORKING_ROLES: readonly WorkingRole[] = ["product_management", "project_manager", "developer"];
const DEFAULT_ROLE: WorkingRole = "product_management";

function parseRole(value: string | undefined): WorkingRole {
  return value && (WORKING_ROLES as readonly string[]).includes(value) ? (value as WorkingRole) : DEFAULT_ROLE;
}

/**
 * ADMIN → Dashboard Configuration (Step 8E — docs/V2-DASHBOARD-CONFIGURATION.md).
 * Org Admin only, same gate shape as `/admin` (docs/V2-ORG-ADMIN-DASHBOARD.md)
 * and `/admin/users`/`/admin/access`. Role switching is a server-rendered
 * `?role=` link, matching how `/admin/access` → `/admin/access/[id]` already
 * navigates rather than client-side tab state.
 *
 * This is configuration UI, not a dashboard preview — compact rows, not the
 * card treatment `/home`/`/admin` use.
 */
export default async function DashboardConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const profile = await getActiveProfile();
  if (!profile) redirect("/welcome");
  const user = await getCurrentUser();
  if (user.accessLevel !== "org_admin" || user.status !== "active") redirect("/home");

  const { role: rawRole } = await searchParams;
  const role = parseRole(rawRole);
  const widgets = await getRoleConfigurationView(user.organizationId, role);

  return (
    <ContainedLayout className="max-w-4xl">
      <PageHeader
        eyebrow="Admin"
        title="Dashboard Configuration"
        description="Choose which Standard Dashboard widgets each Working Role sees. This controls presentation only — it never changes what data a user is authorized to access."
      />

      <div className="mt-6 flex gap-1 border-b border-border-subtle">
        {WORKING_ROLES.map((r) => (
          <Link
            key={r}
            href={`/admin/dashboard-configuration?role=${r}`}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              r === role
                ? "border-b-2 border-indigo-600 text-indigo-700"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {WORKING_ROLE_LABELS[r]}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <DashboardConfigEditor workingRole={role} roleLabel={WORKING_ROLE_LABELS[role]} widgets={widgets} />
      </div>
    </ContainedLayout>
  );
}
