export const PO_WORKFLOW = [
  {
    id: "initiative", title: "Initiative", eyebrow: "Define the outcome",
    summary: "Explain the problem, who needs the change, and what success means.",
    good: ["A specific problem backed by context.", "Named users or customers affected.", "An observable outcome and a way to measure success."],
    example: "Help support agents resolve returns faster; measure the time from request to resolution.",
    readiness: "Save a draft with a name. Add the missing context before requesting a detailed generated plan.",
    destination: "intake", action: "Review initiative intake",
    tab: "Initiative intake",
  },
  {
    id: "features", title: "Features & Backlog", eyebrow: "Choose valuable work",
    summary: "Capture requests and maintain a prioritized set of features and bugs.",
    good: ["Each feature describes a user or business capability.", "Its source, owner, value, and dependencies are visible.", "MoSCoW, priority order, roadmap placement, and release assignment stay distinct."],
    example: "Let customers request a return online, linked to the original support request.",
    readiness: "Create work manually or review imported information. Only authorized people finalize priority changes.",
    destination: "backlog", action: "Open feature backlog", tab: "Feature Backlog",
  },
  {
    id: "stories", title: "Stories & Acceptance Criteria", eyebrow: "Make the work testable",
    summary: "Break a feature into small outcomes and prepare it for engineering refinement.",
    good: ["A story identifies the user, intended action, and benefit.", "Acceptance criteria describe observable outcomes and relevant failure cases.", "Open questions, dependencies, and refinement decisions remain attached."],
    example: "As a customer, I can submit an eligible return and receive a reference number.",
    readiness: "Add a feature first, then create stories manually or review bounded AI suggestions. Approval is a separate action.",
    destination: "workspace/epics", action: "Open stories & criteria", tab: "Planning Workspace → Stories",
  },
  {
    id: "roadmap", title: "Roadmap", eyebrow: "Make the sequence visible",
    summary: "Organize features into Now, Next, Later, or Unscheduled and add release context when known.",
    good: ["Placement follows priority and dependencies.", "Unscheduled work and blockers stay visible.", "Confirmed release dates and cadence enrich the view without inventing delivery commitments."],
    example: "Now: submit returns. Next: track a return. Later: automate refund decisions.",
    readiness: "A feature roadmap works without dates or generated stories. Assign releases when the team has enough evidence.",
    destination: "workspace/roadmap", action: "Open sprint roadmap", tab: "Roadmap",
  },
  {
    id: "sprint", title: "Sprint Planning", eyebrow: "Agree on a realistic commitment",
    summary: "Review ready work, set a sprint goal, and save an editable plan before committing.",
    good: ["A clear sprint goal explains the intended outcome.", "Selected work has readiness evidence and explicit estimates.", "Scope fits the team's capacity and unresolved blockers are addressed."],
    example: "Enable customers to submit a return end to end, with the selected stories fitting the sprint capacity.",
    readiness: "Create a sprint and assess stories or bugs. Readiness and capacity checks still apply when committing.",
    destination: "workspace/sprint-preparation", action: "Open sprint planning", tab: "Sprint Planning",
  },
] as const;

export type PoWorkflowId = (typeof PO_WORKFLOW)[number]["id"];
