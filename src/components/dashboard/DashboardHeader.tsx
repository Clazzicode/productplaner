import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{props.name}</h1>
        {props.description && (
          <p className="mt-0.5 line-clamp-2 max-w-2xl text-sm text-neutral-500">{props.description}</p>
        )}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
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
        </p>
      </div>
      <Link
        href={`/initiatives/${props.initiativeId}/intake`}
        className="shrink-0 text-sm text-indigo-600 hover:underline"
      >
        View intake answers
      </Link>
    </div>
  );
}
