import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import WorkspaceBreadcrumb from "@/components/workspace/WorkspaceBreadcrumb";
import MethodologySwitcher from "./MethodologySwitcher";

export default function DashboardHeader(props: {
  initiativeId: string;
  name: string;
  description: string;
  methodology: string;
  releaseTarget: string | null;
  updatedAt: Date;
  baselineApprovedAt: Date | null;
}) {
  return (
    <div>
      <WorkspaceBreadcrumb initiativeId={props.initiativeId} initiativeName={props.name} />
      <div className="mt-2">
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
                {props.baselineApprovedAt && (
                  <Badge variant="emerald">
                    Baseline approved {props.baselineApprovedAt.toLocaleDateString()}
                  </Badge>
                )}
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
        />
      </div>
    </div>
  );
}
