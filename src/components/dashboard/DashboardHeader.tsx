import Link from "next/link";
import ApprovePlanButton from "@/components/dashboard/ApprovePlanButton";
import StatusBadge from "@/components/roadmapStatus/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import WorkspaceBreadcrumb from "@/components/workspace/WorkspaceBreadcrumb";
import type { ResolvedStatus } from "@/lib/roadmapStatus/types";
import MethodologySwitcher from "./MethodologySwitcher";

export default function DashboardHeader(props: {
  initiativeId: string;
  name: string;
  description: string;
  methodology: string;
  releaseTarget: string | null;
  updatedAt: Date;
  baselineApprovedAt: Date | null;
  status: ResolvedStatus;
  /** Step 8C — the initiative-centric path to "Who has access?"
   * (docs/V2-RESOURCE-ACCESS.md §14). Only rendered for an Organization
   * Admin, since /admin/access is gated the same way. */
  isOrgAdmin: boolean;
}) {
  return (
    <div>
      <WorkspaceBreadcrumb initiativeId={props.initiativeId} initiativeName={props.name} />
      <div className="mt-2 flex flex-wrap items-start gap-2">
        <StatusBadge entityType="initiative" entityId={props.initiativeId} status={props.status} />
      </div>
      <div className="mt-1">
        <PageHeader
          title={props.name}
          description={
            <>
              {props.description && (
                <span className="mb-1.5 block line-clamp-2 max-w-2xl">{props.description}</span>
              )}
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <MethodologySwitcher initiativeId={props.initiativeId} current={props.methodology} />
                {props.releaseTarget && (
                  <>
                    <span className="text-neutral-300">·</span>
                    <span>Release target: {props.releaseTarget}</span>
                  </>
                )}
                <span className="text-neutral-300">·</span>
                <span>Updated {props.updatedAt.toLocaleDateString()}</span>
                {props.baselineApprovedAt ? (
                  <Badge variant="emerald">
                    Baseline approved {props.baselineApprovedAt.toLocaleDateString()}
                  </Badge>
                ) : props.isOrgAdmin ? (
                  <ApprovePlanButton initiativeId={props.initiativeId} />
                ) : null}
              </span>
            </>
          }
          primaryAction={
            <Link
              href={`/initiatives/${props.initiativeId}/intake`}
              className="shrink-0 text-sm text-indigo-600 hover:underline"
            >
              View intake answers
            </Link>
          }
          secondaryActions={
            props.isOrgAdmin && (
              <Link
                href={`/admin/access/${props.initiativeId}`}
                className="shrink-0 text-sm text-indigo-600 hover:underline"
              >
                Who has access?
              </Link>
            )
          }
        />
      </div>
    </div>
  );
}
