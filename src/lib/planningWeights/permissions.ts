import { meetsMinimum, type ResolvedLevel } from "@/lib/access/resolution";

/** Historical experience never confers scoring authority. */
export function canEditPlanningWeights(params: {
  actorStatus: string;
  actorMemberType: string;
  accessLevel: string;
  initiativePermission: ResolvedLevel;
  initiativeExperienceLevel?: string | null;
}): boolean {
  return params.actorStatus === "active" && params.actorMemberType === "internal"
    && meetsMinimum(params.initiativePermission, "edit");
}
