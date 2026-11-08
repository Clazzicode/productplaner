import { meetsMinimum, type ResolvedLevel } from "./resolution";

export const COLLABORATION_ACTIONS = [
  "read", "edit", "submit_feedback", "triage_feedback", "accept_story",
  "approve_plan", "approve_release", "publish", "manage_integrations", "approve_jira_export",
] as const;
export type CollaborationAction = typeof COLLABORATION_ACTIONS[number];
export type ActionActor = {
  status: string;
  memberType: string;
  permissionRole: string;
};

/** Active membership and initiative access must be freshly resolved by the caller.
 * Experience, dashboard visibility and stakeholder titles never confer authority. */
export function canPerformAction(actor: ActionActor, access: ResolvedLevel, action: CollaborationAction): boolean {
  if (actor.status !== "active" || access === "none") return false;
  if (action === "read" || action === "submit_feedback") return meetsMinimum(access, "view");
  if (actor.memberType !== "internal") return false;
  const administrator = actor.permissionRole === "owner" || actor.permissionRole === "admin";
  if (["edit", "triage_feedback", "accept_story"].includes(action)) return administrator || meetsMinimum(access, "edit");
  return administrator;
}
