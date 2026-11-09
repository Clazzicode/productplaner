import HomeOverview from "@/components/dashboard/HomeOverview";
import type { GlobalDashboardData } from "@/lib/dashboard/globalDashboardData";

/** The same home composition for a new account, with honest empty states and
 * a clear activation action instead of illustrative metrics. */
export default function ActivationHome(props: { userName: string; greeting: string }) {
  const empty: GlobalDashboardData = {
    greeting: props.greeting,
    operationalSummary: "Create your first initiative to build a product plan.",
    initiatives: [],
    primary: null,
    timeline: [],
  };
  return <HomeOverview data={empty} showDecisions nextAction={{ label: "Create initiative", href: "/initiatives/new" }} extraWidgets={
    <div className="rounded-md border border-[#d9dfeb] bg-white p-5">
      <h2 className="text-lg font-semibold text-[#11182c]">Your setup</h2>
      <p className="mt-2 text-sm text-[#59657e]">Welcome, {props.userName.trim().split(/\s+/)[0]}. Your workspace is ready for its first initiative.</p>
      <ul className="mt-3 space-y-1 text-sm text-[#59657e]">
        <li>✓ Experience selected</li><li>✓ Working role selected</li><li>Next: create an initiative and develop its plan.</li>
      </ul>
    </div>
  } />;
}
