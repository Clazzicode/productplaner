import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

const QUICK_LINK_CLASS =
  "rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-text-primary hover:bg-neutral-50";

/** Organization-scoped header — deliberately not a personal greeting (that's
 * GlobalDashboardHeader on /home). Same deterministic-summary pattern as the
 * Standard Dashboard, computed in adminDashboardData.ts, never LLM-generated. */
export default function AdminDashboardHeader(props: { orgName: string; operationalSummary: string }) {
  return (
    <PageHeader
      eyebrow="Organization Admin"
      title={`${props.orgName} — Operations Overview`}
      description={props.operationalSummary}
      secondaryActions={
        <>
          <Link href="/admin/users" className={QUICK_LINK_CLASS}>
            View Users
          </Link>
          <Link href="/teams" className={QUICK_LINK_CLASS}>
            View Teams
          </Link>
        </>
      }
      primaryAction={
        <Link
          href="/admin/access"
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Manage Access
        </Link>
      }
    />
  );
}
