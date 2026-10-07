import type { FeatureRecord } from "./model";

// Source: the Product Owner's 21-feature brief, supplied by Avery.
// These are delivery intentions, not evidence of completed implementation.
export const poFeatures = [
  ["Request / Intake Management", "Capture new requests, enhancements, defects, and items coming from Jira. Support manual intake and preserve the original request."],
  ["Requirements Gathering", "Capture the problem, requested change, expected outcome, business rules, dependencies, open questions, and required details."],
  ["Stakeholder Management", "Identify requestors, business owners, decision makers, and stakeholders connected to the work."],
  ["Feature Management", "Create and maintain features based on approved business needs. Preserve the link from the request to the feature."],
  ["Backlog Management", "Manage, organize, and maintain backlog items, including their order, status, and readiness. Keep the same feature records connected to the roadmap."],
  ["Prioritization", "Prioritize features and stories based on business value, urgency, user need, dependencies, risk, and effort. Record the PO's final decision and rationale."],
  ["Roadmap View", "Show prioritized features in Now / Next / Later, using the same records as the backlog."],
  ["User Story Management", "Create, update, split, and maintain user stories under the correct feature."],
  ["Acceptance Criteria Management", "Create and update acceptance criteria so the expected outcome is clear and can be checked."],
  ["Refinement Preparation", "Identify which stories are ready for refinement and which still need clarification or follow-up."],
  ["Refinement Management", "Capture questions, decisions, estimates, dependencies, and updates discussed during refinement."],
  ["Sprint Readiness", "Identify which stories are ready to be considered for sprint planning."],
  ["Sprint Planning Support", "Review prioritized, ready work and determine what should be included in the sprint."],
  ["In-Sprint Clarification", "Allow the PO to answer questions and clarify requirements during development."],
  ["Dependency and Blocker Tracking", "Track dependencies and blockers that affect backlog items or sprint work."],
  ["Demo Management", "Track what is ready to demo, who is demoing it, its feature or story, purpose, and anything not ready. Display title, purpose, engineer/demo owner, demo status, Ready/Not Ready, notes, sprint, completed work, and carryover."],
  ["Sprint Review / Demo Preparation", "Create a clean review view of completed sprint work so the PO can run the demo without rebuilding the information manually."],
  ["PO Validation / Acceptance", "Review completed work against the story and acceptance criteria and record the PO's acceptance decision."],
  ["Release Readiness", "Show what is complete, validated, still open, or at risk before release."],
  ["Feedback and Reprioritization", "Capture feedback and update backlog priorities as needed."],
  ["Jira Integration", "Pull relevant work from Jira and push approved updates back to Jira. Jira remains the execution system. Live integration is deferred until the production foundation is verified."],
] as const;

export function poFeatureRecords(): FeatureRecord[] {
  return poFeatures.map(([name, description], index) => {
    const number = index + 1;
    const review = [1, 2, 6].includes(number);
    const building = [4, 5, 7].includes(number);
    return { id: `po-feature-${number}`, backlogKey: `PO-${String(number).padStart(2, "0")}`, name, description,
      backlogLane: review || building ? "now" : [8, 9].includes(number) ? "next" : "later",
      backlogStatus: review ? "ready_for_review" : building ? "in_progress" : "planned",
      backlogRevision: 1, order: index, ownerUserId: null, owner: null, isMvp: number <= 10,\n      businessValue: "medium", riskLevel: "medium", dependsOnIds: [], sourceRequests: [] };
  });
}
