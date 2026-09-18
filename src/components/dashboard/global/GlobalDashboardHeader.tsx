import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

/** Personalized greeting + deterministic operational summary — both computed
 * server-side from real data in src/lib/dashboard/globalDashboardData.ts, never
 * LLM-generated (see docs/V2-STANDARD-DASHBOARD.md §1). */
export default function GlobalDashboardHeader(props: {
  userName: string;
  greeting: string;
  operationalSummary: string;
}) {
  const firstName = props.userName.trim().split(/\s+/)[0] ?? props.userName;
  return (
    <PageHeader
      eyebrow="Your dashboard"
      title={`${props.greeting}, ${firstName}`}
      description={props.operationalSummary}
      primaryAction={
        <Link
          href="/initiatives/new"
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + New initiative
        </Link>
      }
    />
  );
}
