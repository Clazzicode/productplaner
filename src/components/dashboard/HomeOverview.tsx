import Link from "next/link";
import type { GlobalDashboardData } from "@/lib/dashboard/globalDashboardData";

type IconName = "decision" | "risk" | "calendar" | "delivery" | "activity";

function Icon({ name, size = 25 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    decision: <><path d="M12 3v18M5 7h14M5 7l-3 6h6L5 7Zm14 0-3 6h6l-3-6ZM8 19h8"/></>,
    risk: <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>,
    delivery: <><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 9 9"/></>,
    activity: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function formatDate(date: Date | null | undefined) {
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Not set";
}

export default function HomeOverview(props: {
  data: GlobalDashboardData;
  showDecisions: boolean;
  showActivity?: boolean;
  extraWidgets?: React.ReactNode;
  nextAction?: { label: string; href: string };
}) {
  const { data } = props;
  const primary = data.primary;
  const decisions = primary?.decisions ?? [];
  const blockers = decisions.filter(item => item.severity === "risk");
  const activity = primary?.activity ?? [];
  const release = primary?.nextMilestone;
  const sprint = primary?.currentSprint;
  const cards: { label: string; value: string; href: string; icon: IconName; tone: string }[] = [
    { label: "Decisions", value: String(decisions.length), href: "#decision-queue", icon: "decision", tone: "violet" },
    { label: "At risk", value: String(blockers.length), href: "#blockers", icon: "risk", tone: "red" },
    { label: "Next release", value: formatDate(release?.date), href: primary ? `/initiatives/${primary.id}/workspace/release-readiness` : "/initiatives", icon: "calendar", tone: "violet" },
    { label: "Delivery", value: sprint ? `${sprint.storyCount} stories` : "—", href: primary ? `/initiatives/${primary.id}/workspace/sprints` : "/initiatives", icon: "delivery", tone: "violet" },
  ];

  return (
    <div className="home-overview">
      <h1>Product overview</h1>
      <section aria-label="Product summary" className="home-kpi-grid">
        {cards.map(card => (
          <Link key={card.label} href={card.href} className="home-kpi">
            <span className={`home-kpi-icon home-kpi-icon-${card.tone}`}><Icon name={card.icon} /></span>
            <span className="home-kpi-copy"><span>{card.label}</span><strong>{card.value}</strong></span>
            <span className="home-kpi-chevron" aria-hidden="true">›</span>
          </Link>
        ))}
      </section>

      <div className="home-main-grid">
        <section id="decision-queue" className="home-panel home-decisions">
          <div className="home-panel-heading">
            <div><h2>Needs your decision <span className="home-count">{decisions.length} {decisions.length === 1 ? "item" : "items"}</span></h2><p>Features or changes waiting for your input to keep plans on track.</p></div>
            <Link href="/decisions">View all decisions <span aria-hidden="true">›</span></Link>
          </div>
          {!props.showDecisions ? (
            <p className="home-empty">The decision queue is hidden in your dashboard settings.</p>
          ) : decisions.length === 0 ? (
            <div className="home-empty"><Icon name="activity" size={20} /><div><strong>{props.nextAction ? "Start your product plan" : "No decisions waiting"}</strong><p>{props.nextAction ? "Create your first initiative to plan features, releases, and decisions." : "Items that need a decision will appear here as your work progresses."}</p>{props.nextAction && <Link className="home-start-action" href={props.nextAction.href}>{props.nextAction.label}</Link>}</div></div>
          ) : (
            <div className="home-table-scroll">
              <table className="home-decision-table">
                <thead><tr><th>Item</th><th>Value</th><th>Owner</th><th>Status</th><th>Due</th><th><span className="sr-only">Open</span></th></tr></thead>
                <tbody>{decisions.slice(0, 5).map((item, index) => (
                  <tr key={`${item.href}-${index}`}>
                    <td><Link href={item.href} className="home-decision-item" title={item.action} aria-label={`${item.title}. ${item.impact}. Next step: ${item.action}`}><span className="home-item-icon"><Icon name={item.severity === "risk" ? "risk" : "decision"} size={20} /></span><span><strong>{item.title}</strong><small>{item.impact}</small><em className="home-mobile-action">{item.action}</em></span></Link></td>
                    <td><span className={`home-priority home-priority-${item.severity}`}>{item.severity === "risk" ? "High" : item.severity === "warning" ? "Medium" : "Info"}</span></td>
                    <td className="home-missing">—</td>
                    <td><span className={`home-status home-status-${item.severity}`}>{item.severity === "risk" ? "At risk" : "Decision needed"}</span></td>
                    <td className="home-missing">—</td>
                    <td><Link href={item.href} aria-label={`Review ${item.title}`} className="home-row-more">›</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="home-rail">
          <section className="home-panel home-release">
            <div className="home-rail-heading"><h2>Release progress</h2>{release && <span className="home-release-name">{release.label}</span>}</div>
            {release ? (
              <>
                <div className="home-release-metric"><strong>{formatDate(release.date)}</strong><span>Target date</span></div>
                <div className="home-progress-track" role="note" aria-label="Delivery completion is not tracked"><span /></div>
                <div className="home-release-stats">
                  <div><strong>{primary?.releases.filter(row => row.approved).length ?? 0}</strong><span>Approved</span></div>
                  <div><strong>{primary?.releases.filter(row => !row.approved).length ?? 0}</strong><span>Pending</span></div>
                  <div><strong>{primary?.releases.length ?? 0}</strong><span>Total</span></div>
                </div>
                <p className="home-release-note">Delivery completion is not tracked here yet.</p>
              </>
            ) : <p className="home-empty">Create a release to see its target and approval status here.</p>}
          </section>
          <section id="blockers" className="home-panel home-blockers">
            <div className="home-rail-heading"><h2>Blockers <span className="home-count home-count-red">{blockers.length}</span></h2><Link href="/risks">View all <span aria-hidden="true">›</span></Link></div>
            {blockers.length === 0 ? <p className="home-empty">No recorded blockers. At-risk decisions will appear here.</p> : (
              <ul>{blockers.slice(0, 2).map((item, index) => <li key={`${item.href}-${index}`}><span className="home-blocker-icon"><Icon name="risk" size={20} /></span><Link href={item.href}><strong>{item.title}</strong><small>{item.impact}</small></Link><span className="home-status home-status-risk">Risk</span></li>)}</ul>
            )}
          </section>
        </aside>
      </div>
      <section className="home-panel home-activity">
        <div className="home-rail-heading"><h2>Recent activity</h2><Link href="/activity">View activity <span aria-hidden="true">›</span></Link></div>
        {props.showActivity === false ? <p className="home-empty">Recent activity is hidden in your dashboard settings.</p> : activity.length === 0 ? <p className="home-empty">Your recent planning and delivery updates will appear here.</p> : (
          <ul>{activity.slice(0, 4).map((item, index) => <li key={`${item.label}-${index}`}><span className="home-activity-icon"><Icon name="activity" size={17} /></span><div><strong>{item.label}</strong><small>{formatDate(item.when)}</small></div></li>)}</ul>
        )}
      </section>
      {props.extraWidgets && <details className="home-more"><summary>More workspace context</summary><div>{props.extraWidgets}</div></details>}
    </div>
  );
}
