import { redirect } from "next/navigation";
import { WideLayout } from "@/components/layout/PageLayouts";
import AdminAttentionPanel from "@/components/dashboard/admin/AdminAttentionPanel";
import AdminDashboardHeader from "@/components/dashboard/admin/AdminDashboardHeader";
import AdminTimeline from "@/components/dashboard/admin/AdminTimeline";
import AccessIntelligencePanel from "@/components/dashboard/admin/AccessIntelligencePanel";
import DeliveryIntelligencePanel from "@/components/dashboard/admin/DeliveryIntelligencePanel";
import IntegrationHealthPanel from "@/components/dashboard/admin/IntegrationHealthPanel";
import OrgSummaryStrip from "@/components/dashboard/admin/OrgSummaryStrip";
import PortfolioHealthTable from "@/components/dashboard/admin/PortfolioHealthTable";
import TeamsIntelligencePanel from "@/components/dashboard/admin/TeamsIntelligencePanel";
import UsersIntelligencePanel from "@/components/dashboard/admin/UsersIntelligencePanel";
import { getActiveProfile, getCurrentUser } from "@/lib/auth/session";
import { loadAdminDashboardData } from "@/lib/dashboard/adminDashboardData";
import {
  ADMIN_DASHBOARD_ORDER,
  LEFT_COLUMN_ORDER,
  RIGHT_COLUMN_ORDER,
  type AdminDashboardWidgetId,
} from "@/lib/dashboard/adminWidgetRegistry";

export const dynamic = "force-dynamic";

/**
 * Organization Admin Dashboard (Step 8D — docs/V2-ORG-ADMIN-DASHBOARD.md):
 * the organization-wide control center, distinct from the Standard
 * Dashboard's personal "my work" home (`/home`). Reuses the Step 6 design
 * system and the Step 7B/8C data-loader conventions, but a deliberately
 * different, denser composition — no personal greeting, no per-role
 * ordering, portfolio/attention/access take priority over "current focus."
 *
 * Authorization: real, server-side, and identical in shape to the gate
 * already proven live on /admin/users and /admin/access
 * (docs/V2-RESOURCE-ACCESS.md §12/§14) — `status !== "active"` is added here
 * so a disabled Organization Admin is blocked too, per this phase's explicit
 * "only active Organization Admin users" requirement. A Standard User (or a
 * disabled admin) is redirected to /home, the same behavior the two existing
 * admin-only pages already use — no new access-denied pattern invented.
 */
export default async function AdminDashboardPage() {
  const profile = await getActiveProfile();
  if (!profile) redirect("/welcome");
  const user = await getCurrentUser();
  if (user.accessLevel !== "org_admin" || user.status !== "active") redirect("/home");

  const data = await loadAdminDashboardData(user.organizationId);

  function widget(id: AdminDashboardWidgetId) {
    switch (id) {
      case "portfolio_health":
        return <PortfolioHealthTable rows={data.portfolio} />;
      case "delivery_intelligence":
        return <DeliveryIntelligencePanel data={data.delivery} />;
      case "teams_intelligence":
        return <TeamsIntelligencePanel data={data.teams} />;
      case "admin_attention":
        return <AdminAttentionPanel items={data.attention} />;
      case "users_intelligence":
        return <UsersIntelligencePanel data={data.users} />;
      case "access_intelligence":
        return <AccessIntelligencePanel data={data.access} />;
      case "admin_timeline":
        return <AdminTimeline entries={data.timeline} />;
      case "integration_health":
        return <IntegrationHealthPanel data={data.integrations} />;
    }
  }

  return (
    <WideLayout>
      <AdminDashboardHeader orgName={data.orgName} operationalSummary={data.operationalSummary} />

      <div className="mt-6 space-y-4">
        <OrgSummaryStrip summary={data.summary} />

        {/* Large desktop / standard laptop: explicit two-column control-center layout. */}
        <div className="hidden gap-4 xl:grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            {LEFT_COLUMN_ORDER.map((id) => (
              <div key={id}>{widget(id)}</div>
            ))}
          </div>
          <div className="min-w-0 space-y-4">
            {RIGHT_COLUMN_ORDER.map((id) => (
              <div key={id}>{widget(id)}</div>
            ))}
          </div>
        </div>

        {/* Narrow / tablet: single column, left column's widgets then right column's. */}
        <div className="space-y-4 xl:hidden">
          {ADMIN_DASHBOARD_ORDER.map((id) => (
            <div key={id}>{widget(id)}</div>
          ))}
        </div>
      </div>
    </WideLayout>
  );
}
