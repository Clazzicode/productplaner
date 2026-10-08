import { emptyRequest, type RequestRecord } from "./model";

export function poDemoEnabled() {
  return process.env.NODE_ENV === "development" && process.env.PO_DEMO_ENABLED === "true";
}
export function demoRequests(): RequestRecord[] {
  return [
    { ...emptyRequest(), id: "sample-map", title: "Save map views for returning users", kind: "enhancement", requestor: "Product Owner",
      problem: "Users rebuild their map filters every time they return.", requestedChange: "Let a signed-in user save a named map view and reopen it.",
      outcome: "A returning user can restore their view in one click.", businessRules: "Saved views belong to the signed-in user. Other organizations cannot access them.",
      dependencies: "Requires authenticated user accounts.", status: "clarifying",
      questions: [{ id: "q1", question: "How many views can a user save?", owner: "Product Owner", answer: "" }],
      priority: { ...emptyRequest().priority, businessValue: 5, urgency: 4, userNeed: 5, dependencyImpact: 3, risk: 2, effort: 2, effortPoints: 3, decision: "untriaged", reason: "" },
      revision: 1, capabilityId: null, updatedAt: "2026-10-02T12:00:00.000Z" },
    { ...emptyRequest(), id: "sample-style", title: "Additional map color themes", requestor: "Design team",
      problem: "Users want more visual customization.", requestedChange: "Add three accessible map themes.", outcome: "Users can choose a theme while retaining readable contrast.",
      userAffected: "People who publish branded maps", businessValueNarrative: "Improves adoption for branded customer experiences.",
      businessRules: "Every theme must meet contrast requirements.", inScope: "Three accessible themes.", outOfScope: "Custom theme builders.",
      assumptions: "The current renderer supports the required tokens.", dependencies: "Design review.", risks: "Contrast regressions.",
      stakeholders: "Product Owner and Design", supportingMaterials: "Design theme brief", definitionOfSuccess: "All three themes pass accessibility review.",
      readiness: "ready_for_feature", status: "ready", priority: { ...emptyRequest().priority, businessValue: 2, urgency: 2, userNeed: 3, dependencyImpact: 1, risk: 1, effort: 2, effortPoints: 3, decision: "later", reason: "Saved views solve a more frequent user problem first." },
      revision: 1, capabilityId: null, updatedAt: "2026-10-02T12:00:00.000Z" },
  ];
}
