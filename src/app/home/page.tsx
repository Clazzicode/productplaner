import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import HomeOverview from "@/components/dashboard/HomeOverview";
import DecisionsRequiredPanel from "@/components/dashboard/DecisionsRequiredPanel";
import RecentActivity from "@/components/dashboard/RecentActivity";
import SprintReleaseStatus from "@/components/dashboard/SprintReleaseStatus";
import UpcomingActions from "@/components/dashboard/UpcomingActions";
import CurrentFocus from "@/components/dashboard/global/CurrentFocus";
import InitiativeSummaryList from "@/components/dashboard/global/InitiativeSummaryList";
import PlanHealthSummary from "@/components/dashboard/global/PlanHealthSummary";
import RoadmapSnapshot from "@/components/dashboard/global/RoadmapSnapshot";
import UpcomingTimeline from "@/components/dashboard/global/UpcomingTimeline";
import ActivationHome from "@/components/home/ActivationHome";
import { listAuthorizedInitiativeIds } from "@/lib/access/initiativeAccess";
import { requireCurrentUser } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { getEffectiveWidgetVisibility } from "@/lib/dashboard/dashboardConfiguration";
import { resolveWidgetVisibility, filterVisible } from "@/lib/dashboard/dashboardConfigResolution";
import { loadGlobalDashboardData } from "@/lib/dashboard/globalDashboardData";
import { loadLifecycleDashboardData } from "@/lib/dashboard/lifecycleDashboardData";
import { resolveMainColumnOrder, type DashboardWidgetId } from "@/lib/dashboard/widgetRegistry";
import { resolveWorkingRole } from "@/lib/onboarding/resolveWorkingRole";
import { readOnboardingStateServer } from "@/lib/onboarding/tempStateServer";

export const dynamic = "force-dynamic";

/**
 * Guided-activation restructure (reference doc §7/§8, Block 4): `/home` is
 * now a thin router on the centralized lifecycle resolver (Block 2), not a
 * single static screen. `no_initiative` renders Activation Home instead of
 * the operational dashboard with nothing in it; the four intermediate stages
 * render a focused, one-primary-action LifecycleDashboard; only
 * `active_execution` renders today's full Standard Dashboard widget body —
 * unchanged below, still backed by loadGlobalDashboardData — which is the
 * "mature dashboard, shown once earned" the reference doc describes.
 */
async function HomePage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);

  const authorizedInitiativeIds = await listAuthorizedInitiativeIds(user);
  const lifecycle = await loadLifecycleDashboardData(user.id, authorizedInitiativeIds);

  if (lifecycle.resolution.stage === "no_initiative") {
    return <ActivationHome userName={user.name} greeting={lifecycle.greeting} />;
  }
  const onboarding = await readOnboardingStateServer();
  const workingRole = resolveWorkingRole(user.workingRole, onboarding.workingRole);

  const data = await loadGlobalDashboardData(user.id, authorizedInitiativeIds);

  const visibility = workingRole
    ? await getEffectiveWidgetVisibility(user.organizationId, workingRole)
    : resolveWidgetVisibility({});
  const mainOrder = filterVisible(resolveMainColumnOrder(workingRole), visibility);

  const decisions = data.primary?.decisions ?? [];
  const activity = data.primary?.activity ?? [];
  const actions = data.primary?.actions ?? { now: [], next: [], later: [] };

  function widget(id: DashboardWidgetId) {
    switch (id) {
      case "plan_health":
        return <PlanHealthSummary primary={data.primary} />;
      case "current_sprint":
        if (!data.primary) return <p className="rounded border p-4">No delivery commitments yet. Your planning work remains available.</p>;
        return (
          <SprintReleaseStatus
            initiativeId={data.primary!.id}
            currentSprint={data.primary!.currentSprint}
            releases={data.primary!.releases}
          />
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
        return <UpcomingActions now={actions.now} next={actions.next} later={actions.later} />;
      case "recent_activity":
        return <RecentActivity items={activity} />;
      case "upcoming_timeline":
        return <UpcomingTimeline entries={data.timeline} />;
    }
  }

  const extras = mainOrder.filter(id => !["attention", "recent_activity"].includes(id));
  return <HomeOverview data={data} showDecisions={visibility.attention} showActivity={visibility.recent_activity} extraWidgets={
    <div className="grid gap-4 lg:grid-cols-2">{extras.map(id => <div key={id} className="min-w-0">{widget(id)}</div>)}</div>
  } />;
}

export default withAuthenticatedPage(HomePage);
