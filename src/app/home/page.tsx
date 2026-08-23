import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/PageLayouts";
import DecisionsRequiredPanel from "@/components/dashboard/DecisionsRequiredPanel";
import RecentActivity from "@/components/dashboard/RecentActivity";
import SprintReleaseStatus from "@/components/dashboard/SprintReleaseStatus";
import UpcomingActions from "@/components/dashboard/UpcomingActions";
import CurrentFocus from "@/components/dashboard/global/CurrentFocus";
import GlobalDashboardHeader from "@/components/dashboard/global/GlobalDashboardHeader";
import InitiativeSummaryList from "@/components/dashboard/global/InitiativeSummaryList";
import PlanHealthSummary from "@/components/dashboard/global/PlanHealthSummary";
import RoadmapSnapshot from "@/components/dashboard/global/RoadmapSnapshot";
import UpcomingTimeline from "@/components/dashboard/global/UpcomingTimeline";
import { Card, CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { getActiveProfile, getCurrentUser } from "@/lib/auth/session";
import { loadGlobalDashboardData } from "@/lib/dashboard/globalDashboardData";
import { resolveDashboardOrder, resolveMainColumnOrder, type DashboardWidgetId } from "@/lib/dashboard/widgetRegistry";
import { readOnboardingStateServer } from "@/lib/onboarding/tempStateServer";

export const dynamic = "force-dynamic";

/**
 * Standard User Dashboard (Step 7B — docs/V2-STANDARD-DASHBOARD.md): the global
 * operational home for a normal organization member. Distinct from
 * `/initiatives/[initiativeId]/dashboard` (unchanged, untouched by this phase),
 * which stays the detailed view of one initiative.
 *
 * Authorization boundary (docs/V2-ACCESS-TEAMS-VISIBILITY.md §1, §5, §20): real
 * per-initiative Resource Access doesn't exist yet, so `authorizedInitiativeIds`
 * is `null` below — every initiative this demo user owns is shown. Nothing here
 * fakes a permission check; the seam for a future authorization layer to narrow
 * this list is in loadGlobalDashboardData, not invented here.
 *
 * Working Role (from the Step 4 onboarding cookie, not yet a persisted `User`
 * field) only ever changes widget ORDER via widgetRegistry.ts — it never
 * changes which data is fetched or shown.
 */
export default async function HomePage() {
  const profile = await getActiveProfile();
  if (!profile) redirect("/welcome");
  const user = await getCurrentUser();
  const onboarding = await readOnboardingStateServer();
  const workingRole = onboarding.workingRole ?? null;

  const data = await loadGlobalDashboardData(user.id, null);

  const mainOrder = resolveMainColumnOrder(workingRole);
  const fullOrder = resolveDashboardOrder(workingRole);

  const decisions = data.primary?.decisions ?? [];
  const activity = data.primary?.activity ?? [];
  const actions = data.primary?.actions ?? { now: [], next: [], later: [] };

  function widget(id: DashboardWidgetId) {
    switch (id) {
      case "plan_health":
        return <PlanHealthSummary primary={data.primary} />;
      case "current_sprint":
        return data.primary ? (
          <SprintReleaseStatus
            initiativeId={data.primary.id}
            currentSprint={data.primary.currentSprint}
            releases={data.primary.releases}
          />
        ) : (
          <Card>
            <CardTitle>Current Sprint</CardTitle>
            <div className="mt-3">
              <EmptyState title="No sprint yet" description="Sprint status appears once a plan is generated." />
            </div>
          </Card>
        );
      case "roadmap_snapshot":
        return <RoadmapSnapshot primary={data.primary} />;
      case "current_focus":
        return <CurrentFocus primary={data.primary} />;
      case "initiative_summary":
        return <InitiativeSummaryList initiatives={data.initiatives} />;
      case "attention":
        return <DecisionsRequiredPanel items={decisions} />;
      case "upcoming_actions":
        return data.primary ? (
          <UpcomingActions now={actions.now} next={actions.next} later={actions.later} />
        ) : (
          <Card>
            <CardTitle>Upcoming Actions</CardTitle>
            <div className="mt-3">
              <EmptyState title="Nothing yet" description="Suggested next steps appear once a plan is generated." />
            </div>
          </Card>
        );
      case "recent_activity":
        return <RecentActivity items={activity} />;
      case "upcoming_timeline":
        return <UpcomingTimeline entries={data.timeline} />;
    }
  }

  return (
    <DashboardLayout>
      <GlobalDashboardHeader userName={user.name} greeting={data.greeting} operationalSummary={data.operationalSummary} />

      <div className="mt-6">
        {/* Large desktop / standard laptop: two columns, timeline in the right rail. */}
        <div className="hidden gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            {mainOrder.map((id) => (
              <div key={id}>{widget(id)}</div>
            ))}
          </div>
          <aside className="min-w-0 space-y-4">{widget("upcoming_timeline")}</aside>
        </div>

        {/* Narrow / tablet: single column, timeline takes its ranked position. */}
        <div className="space-y-4 xl:hidden">
          {fullOrder.map((id) => (
            <div key={id}>{widget(id)}</div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
