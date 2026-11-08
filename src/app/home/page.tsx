import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/PageLayouts";
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
import { planningLabel, commitmentLabel } from "@/lib/planning/readiness";
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
  const evidence = data.primary?.planningEvidence;
  const summaryCards = [
    { label: "Active initiatives", value: String(data.initiatives.length), detail: "Authorized planning work", href: "/initiatives", tone: "text-[#5145ed]" },
    { label: "Planning evidence", value: evidence ? String(evidence.featureCount) : "—", detail: evidence ? planningLabel(evidence) : "Add an initiative to begin", href: data.primary ? `/initiatives/${data.primary.id}/overview` : "/initiatives", tone: "text-[#5145ed]" },
    { label: "Delivery commitments", value: evidence ? String(evidence.committedSprintCount + evidence.approvedReleaseCount) : "—", detail: evidence ? commitmentLabel(evidence) : "No commitments recorded", href: data.primary ? `/initiatives/${data.primary.id}/workspace/sprints` : "/initiatives", tone: "text-[#d97706]" },
    { label: "Decisions needed", value: String(decisions.length), detail: decisions.length ? "Review the decision queue" : "Nothing needs a decision", href: "#decision-queue", tone: "text-[#dc3545]" },
  ];

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

  return (
    <DashboardLayout>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5145ed]">Your workspace</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0d1b3e]">Portfolio overview</h1><p className="mt-2 max-w-3xl text-sm text-text-secondary">{data.greeting}, {user.name.trim().split(/\s+/)[0]}. {data.operationalSummary}</p></div>
        <Link href={lifecycle.resolution.nextAction.href} className="rounded-lg bg-[#5145ed] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4238d7]">{lifecycle.resolution.nextAction.label}</Link>
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="min-w-0 space-y-4"><section aria-label="Portfolio summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaryCards.map(card => <Link key={card.label} href={card.href} className="min-w-0 rounded-2xl border border-[#dfe3f4] bg-white p-4 shadow-[0_5px_20px_rgba(13,27,62,0.04)] transition hover:border-[#b8b2ff]"><p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p><h2 className="mt-1 text-sm font-semibold text-[#0d1b3e]">{card.label}</h2><p className="mt-1 line-clamp-2 text-xs text-text-secondary">{card.detail}</p></Link>)}
        </section><section id="decision-queue" className="min-w-0">{visibility.attention ? widget("attention") : <div className="rounded-2xl border border-[#dfe3f4] bg-white p-5 text-sm text-text-secondary">The decision queue is hidden by your dashboard configuration.</div>}</section></div>
        <aside className="min-w-0 space-y-4">{visibility.upcoming_timeline && widget("upcoming_timeline")}{visibility.plan_health && widget("plan_health")}</aside>
      </div>
      <section className="mt-4 rounded-2xl border border-[#dfe3f4] bg-white p-5 shadow-[0_5px_20px_rgba(13,27,62,0.04)]">
        <h2 className="text-lg font-semibold text-[#0d1b3e]">Lifecycle pipeline</h2>
        <p className="mt-1 text-xs text-text-secondary">Follow the planning and delivery path for your authorized initiatives.</p>
        <ol className="mt-4 grid gap-2 sm:grid-cols-5">{["Discover", "Plan", "Deliver", "Validate", "Release"].map((stage, index) => <li key={stage} className="rounded-xl border border-[#dfe3f4] bg-[#f8f8ff] px-4 py-3"><span className="text-xs font-semibold text-[#5145ed]">0{index + 1}</span><p className="mt-1 text-sm font-semibold text-[#0d1b3e]">{stage}</p></li>)}</ol>
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">{mainOrder.filter(id => !["attention", "plan_health", "upcoming_timeline"].includes(id)).map(id => <div key={id} className="min-w-0">{widget(id)}</div>)}</div>
    </DashboardLayout>
  );
}

export default withAuthenticatedPage(HomePage);
