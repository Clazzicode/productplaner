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
import ActivationHome from "@/components/home/ActivationHome";
import LifecycleDashboard from "@/components/home/LifecycleDashboard";
import { listAuthorizedInitiativeIds } from "@/lib/access/initiativeAccess";
import { requireCurrentUser } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { getEffectiveWidgetVisibility } from "@/lib/dashboard/dashboardConfiguration";
import { resolveWidgetVisibility, filterVisible } from "@/lib/dashboard/dashboardConfigResolution";
import { loadGlobalDashboardData } from "@/lib/dashboard/globalDashboardData";
import { loadLifecycleDashboardData } from "@/lib/dashboard/lifecycleDashboardData";
import { resolveDashboardOrder, resolveMainColumnOrder, type DashboardWidgetId } from "@/lib/dashboard/widgetRegistry";
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
export default async function HomePage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  if (user.profiles.length === 0) redirect("/welcome");

  const authorizedInitiativeIds = await listAuthorizedInitiativeIds(user);
  const lifecycle = await loadLifecycleDashboardData(user.id, authorizedInitiativeIds);

  if (lifecycle.resolution.stage === "no_initiative") {
    return <ActivationHome userName={user.name} greeting={lifecycle.greeting} />;
  }
  if (lifecycle.resolution.stage !== "active_execution") {
    // initiativeSummary is always populated once an initiative exists —
    // every non-"no_initiative"/"active_execution" stage requires one.
    return (
      <LifecycleDashboard
        greeting={lifecycle.greeting}
        userName={user.name}
        resolution={lifecycle.resolution}
        initiativeSummary={lifecycle.initiativeSummary!}
      />
    );
  }

  const onboarding = await readOnboardingStateServer();
  const workingRole = resolveWorkingRole(user.workingRole, onboarding.workingRole);

  const data = await loadGlobalDashboardData(user.id, authorizedInitiativeIds);

  const visibility = workingRole
    ? await getEffectiveWidgetVisibility(user.organizationId, workingRole)
    : resolveWidgetVisibility({});
  const mainOrder = filterVisible(resolveMainColumnOrder(workingRole), visibility);
  const fullOrder = filterVisible(resolveDashboardOrder(workingRole), visibility);

  const decisions = data.primary?.decisions ?? [];
  const activity = data.primary?.activity ?? [];
  const actions = data.primary?.actions ?? { now: [], next: [], later: [] };

  function widget(id: DashboardWidgetId) {
    switch (id) {
      case "plan_health":
        return <PlanHealthSummary primary={data.primary} />;
      case "current_sprint":
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

  return (
    <DashboardLayout>
      <GlobalDashboardHeader userName={user.name} greeting={data.greeting} operationalSummary={data.operationalSummary} />

      <div className="mt-6">
        {/* Large desktop / standard laptop: two columns, timeline in the right rail —
            or one column when the timeline widget is configured off. */}
        <div
          className={`hidden gap-4 xl:grid ${
            visibility.upcoming_timeline ? "xl:grid-cols-[minmax(0,1fr)_340px]" : "xl:grid-cols-1"
          }`}
        >
          <div className="min-w-0 space-y-4">
            {mainOrder.map((id) => (
              <div key={id}>{widget(id)}</div>
            ))}
          </div>
          {visibility.upcoming_timeline && <aside className="min-w-0 space-y-4">{widget("upcoming_timeline")}</aside>}
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
