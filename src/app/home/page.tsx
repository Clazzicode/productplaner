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
import { listAuthorizedInitiativeIds } from "@/lib/access/initiativeAccess";
import { getActiveProfile, getCurrentUser } from "@/lib/auth/session";
import { getEffectiveWidgetVisibility } from "@/lib/dashboard/dashboardConfiguration";
import { resolveWidgetVisibility, filterVisible } from "@/lib/dashboard/dashboardConfigResolution";
import { loadGlobalDashboardData } from "@/lib/dashboard/globalDashboardData";
import { resolveDashboardOrder, resolveMainColumnOrder, type DashboardWidgetId } from "@/lib/dashboard/widgetRegistry";
import { resolveWorkingRole } from "@/lib/onboarding/resolveWorkingRole";
import { readOnboardingStateServer } from "@/lib/onboarding/tempStateServer";

export const dynamic = "force-dynamic";

/**
 * Standard User Dashboard (Step 7B — docs/V2-STANDARD-DASHBOARD.md): the global
 * operational home for a normal organization member. Distinct from
 * `/initiatives/[initiativeId]/dashboard` (unchanged, untouched by this phase),
 * which stays the detailed view of one initiative.
 *
 * Authorization boundary (docs/V2-RESOURCE-ACCESS.md §16, Step 8C): the
 * dashboard now receives the canonical authorized-initiative set from
 * `listAuthorizedInitiativeIds()` — the same function every other authorized
 * list/page uses, not a re-derived filter. For the current org_admin demo
 * user this includes every initiative in the org (implicit admin access), so
 * the visible result looks the same as before Step 8C — expected, not a sign
 * the filtering is inert.
 *
 * Working Role (from the Step 4 onboarding cookie, not yet a persisted `User`
 * field) only ever changes widget ORDER via widgetRegistry.ts — it never
 * changes which data is fetched or shown.
 *
 * Dashboard Configuration (Step 8E — docs/V2-DASHBOARD-CONFIGURATION.md):
 * `getEffectiveWidgetVisibility` is the one seam this page adds — it decides
 * which of the already-authorized widgets below actually render. It has no
 * knowledge of `authorizedInitiativeIds`/`accessLevel`/`memberType` and
 * cannot grant access to anything; `loadGlobalDashboardData` is called
 * exactly as before, regardless of what's visible. No Working Role yet
 * (onboarding incomplete, or an Org Admin with none set) skips the lookup
 * entirely and uses pure registry defaults — never a guessed role.
 */
export default async function HomePage() {
  const profile = await getActiveProfile();
  if (!profile) redirect("/welcome");
  const user = await getCurrentUser();
  const onboarding = await readOnboardingStateServer();
  const workingRole = resolveWorkingRole(user.workingRole, onboarding.workingRole);

  const authorizedInitiativeIds = await listAuthorizedInitiativeIds(user.id);
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
