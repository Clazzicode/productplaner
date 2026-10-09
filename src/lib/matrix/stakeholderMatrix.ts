import { db } from "@/lib/db";

export const MATRIX_AUDIENCES = ["executive", "product_owner", "delivery_team", "stakeholder"] as const;
export type MatrixAudience = (typeof MATRIX_AUDIENCES)[number];
export type MatrixHealth = "healthy" | "watch" | "critical" | "neutral";

export interface MatrixCell {
  audience: MatrixAudience;
  headline: string;
  detail: string;
}

export interface MatrixRow {
  id: string;
  domain: string;
  metric: string;
  label: string;
  health: MatrixHealth;
  href: string;
  cells: MatrixCell[];
}

export interface AccountabilityRow {
  id: string;
  name: string;
  company: string | null;
  external: boolean;
  influence: string;
  interest: string;
  roles: string[];
  planning: number;
  delivery: number;
  governance: number;
  engagementExpectation: string;
}

export interface MatrixAttentionItem {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  context: string;
  owner: string | null;
  href: string;
}

export interface StakeholderMatrixData {
  generatedAt: string;
  initiative: { id: string; name: string; projectName: string; methodology: string };
  summary: {
    features: number;
    stories: number;
    readyItems: number;
    openBugs: number;
    openBlockers: number;
    people: number;
  };
  rows: MatrixRow[];
  accountability: AccountabilityRow[];
  attention: MatrixAttentionItem[];
  sourceCoverage: { label: string; count: number }[];
}

function healthFromCount(count: number, criticalThreshold = 1): MatrixHealth {
  if (count >= criticalThreshold) return "critical";
  return count > 0 ? "watch" : "healthy";
}

function cell(audience: MatrixAudience, headline: string, detail: string): MatrixCell {
  return { audience, headline, detail };
}

function requestTitle(data: unknown): string {
  if (data && typeof data === "object" && !Array.isArray(data) && "title" in data) {
    return String((data as { title?: unknown }).title || "Planning request");
  }
  return "Planning request";
}

function roleLabel(role: string): string {
  return role.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export async function loadStakeholderMatrix(initiativeId: string): Promise<StakeholderMatrixData | null> {
  const initiative = await db.initiative.findUnique({
    where: { id: initiativeId },
    select: {
      id: true,
      name: true,
      methodology: true,
      projectId: true,
      project: { select: { name: true } },
      prototype: { select: { id: true } },
      intakeAnswerSet: { select: { id: true } },
    },
  });
  if (!initiative?.prototype || !initiative.intakeAnswerSet) return null;

  const prototypeId = initiative.prototype.id;
  const projectScope = { projectId: initiative.projectId, OR: [{ initiativeId }, { initiativeId: null }] };
  const [
    capabilities,
    stories,
    requests,
    bugs,
    blockers,
    dependencyCount,
    risks,
    decisions,
    assignments,
    refinementSessions,
    readiness,
    sprintPlans,
    releases,
    sprints,
    sourceRecords,
    documents,
    integrationConnections,
  ] = await Promise.all([
    db.capability.findMany({
      where: { intakeAnswerSetId: initiative.intakeAnswerSet.id },
      select: { id: true, name: true, isMvp: true, riskLevel: true, backlogLane: true, releaseId: true },
    }),
    db.artifactLayer.findMany({
      where: { prototypeId, type: "story", archivedAt: null, readinessStatus: { not: "split" } },
      select: { id: true, title: true, points: true, sprintId: true, readinessStatus: true },
    }),
    db.planningRequest.findMany({
      where: { initiativeId, archivedAt: null },
      select: { id: true, data: true, capabilityId: true, sourceRecordId: true },
    }),
    db.bugPlanningRecord.findMany({
      where: { initiativeId, archivedAt: null },
      select: { id: true, severity: true, status: true, readinessStatus: true, owner: { select: { name: true } }, request: { select: { data: true } } },
    }),
    db.planningBlocker.findMany({
      where: { initiativeId },
      select: { id: true, description: true, status: true, dueAt: true, owner: { select: { name: true } } },
    }),
    db.workDependency.count({ where: { initiativeId } }),
    db.risk.findMany({ where: projectScope, select: { id: true, description: true, severity: true, status: true, owner: { select: { name: true } } } }),
    db.decision.findMany({ where: projectScope, select: { id: true, title: true, decidedAt: true, decidedByUser: { select: { name: true } } } }),
    db.stakeholderAssignment.findMany({
      where: { projectId: initiative.projectId, archivedAt: null, OR: [{ initiativeId }, { initiativeId: null }] },
      select: {
        id: true,
        productRole: true,
        responsibility: true,
        influence: true,
        interest: true,
        engagementExpectation: true,
        planningRequestId: true,
        capabilityId: true,
        storyId: true,
        sprintId: true,
        releaseId: true,
        decisionId: true,
        refinementSessionId: true,
        stakeholder: { select: { id: true, displayName: true, company: true, external: true } },
      },
    }),
    db.refinementSession.findMany({
      where: { initiativeId },
      select: {
        id: true,
        title: true,
        status: true,
        questions: { where: { status: "open" }, select: { id: true, question: true, owner: { select: { name: true } } } },
        actions: { where: { status: "open" }, select: { id: true, title: true, owner: { select: { name: true } } } },
      },
    }),
    db.sprintReadinessAssessment.findMany({
      where: { initiativeId, invalidatedAt: null },
      orderBy: { createdAt: "desc" },
      select: { storyId: true, bugId: true, decision: true },
    }),
    db.sprintPlan.findMany({ where: { initiativeId }, select: { id: true, status: true, goal: true, plannedPoints: true, capacityPoints: true } }),
    db.release.findMany({ where: { prototypeId }, orderBy: { targetDate: "asc" }, select: { id: true, name: true, targetDate: true } }),
    db.sprint.findMany({ where: { prototypeId }, orderBy: { sprintNumber: "asc" }, select: { id: true, sprintNumber: true, capacityPoints: true, startDate: true, endDate: true } }),
    db.requestSourceRecord.findMany({ where: { initiativeId }, select: { type: true } }),
    db.document.findMany({ where: { projectId: initiative.projectId, OR: [{ initiativeId }, { initiativeId: null }] }, select: { id: true, status: true } }),
    db.integrationConnection.findMany({ where: { initiativeId }, select: { status: true, lastSyncAt: true, provider: { select: { name: true } } } }),
  ]);

  const activeBlockers = blockers.filter((item) => item.status === "open" || item.status === "in_progress");
  const openBugs = bugs.filter((item) => !["resolved", "closed"].includes(item.status));
  const severeBugs = openBugs.filter((item) => item.severity === "critical" || item.severity === "high");
  const activeRisks = risks.filter((item) => !["mitigated", "closed"].includes(item.status));
  const severeRisks = activeRisks.filter((item) => item.severity === "critical" || item.severity === "high");
  const openDecisions = decisions.filter((item) => !item.decidedAt);
  const openQuestions = refinementSessions.flatMap((session) => session.questions.map((question) => ({ ...question, session: session.title })));
  const openActions = refinementSessions.flatMap((session) => session.actions.map((action) => ({ ...action, session: session.title })));
  const latestReadiness = new Map<string, string>();
  for (const assessment of readiness) {
    const key = assessment.storyId ? `story:${assessment.storyId}` : `bug:${assessment.bugId}`;
    if (!latestReadiness.has(key)) latestReadiness.set(key, assessment.decision);
  }
  const readyItems = [...latestReadiness.values()].filter((decision) => decision === "ready" || decision === "overridden").length;
  const committedPlans = sprintPlans.filter((plan) => plan.status === "committed");
  const totalPlanned = committedPlans.reduce((sum, plan) => sum + plan.plannedPoints, 0);
  const totalCapacity = committedPlans.reduce((sum, plan) => sum + plan.capacityPoints, 0);
  const assignedFeatures = capabilities.filter((feature) => feature.releaseId).length;
  const scheduledFeatures = capabilities.filter((feature) => feature.backlogLane !== "unscheduled").length;
  const mvpFeatures = capabilities.filter((feature) => feature.isMvp).length;
  const highRiskFeatures = capabilities.filter((feature) => feature.riskLevel === "critical" || feature.riskLevel === "high").length;
  const sourcedRequests = requests.filter((request) => request.sourceRecordId).length;
  const convertedRequests = requests.filter((request) => request.capabilityId).length;
  const integration = integrationConnections[0] ?? null;

  const rows: MatrixRow[] = [
    {
      id: "scope",
      domain: "Scope & value",
      metric: `${mvpFeatures}/${capabilities.length}`,
      label: "MVP features",
      health: highRiskFeatures > 0 ? "watch" : "healthy",
      href: `/initiatives/${initiativeId}/workspace/features`,
      cells: [
        cell("executive", `${mvpFeatures} MVP commitments`, `${highRiskFeatures} high-risk features shape the investment conversation.`),
        cell("product_owner", `${scheduledFeatures} features placed`, `${capabilities.length - scheduledFeatures} remain unscheduled across Now, Next, Later.`),
        cell("delivery_team", `${stories.length} stories defined`, `${stories.filter((story) => story.points != null).length} have estimates.`),
        cell("stakeholder", `${convertedRequests}/${requests.length} requests promoted`, "Trace approved needs into the feature plan."),
      ],
    },
    {
      id: "roadmap",
      domain: "Roadmap & releases",
      metric: `${assignedFeatures}/${capabilities.length}`,
      label: "Features assigned",
      health: capabilities.length > 0 && assignedFeatures < capabilities.length ? "watch" : "healthy",
      href: `/initiatives/${initiativeId}/workspace/roadmap`,
      cells: [
        cell("executive", `${releases.length} planned releases`, releases[0] ? `Next target: ${releases[0].name}.` : "No release target is recorded."),
        cell("product_owner", `${capabilities.length - assignedFeatures} unassigned features`, "Confirm roadmap placement and release intent."),
        cell("delivery_team", `${dependencyCount} tracked dependencies`, "Review sequencing before committing delivery dates."),
        cell("stakeholder", `${scheduledFeatures} roadmap-visible features`, "Roadmap placement communicates expected timing without changing priority."),
      ],
    },
    {
      id: "delivery",
      domain: "Sprint delivery",
      metric: totalCapacity > 0 ? `${Math.round((totalPlanned / totalCapacity) * 100)}%` : "—",
      label: "Committed capacity",
      health: totalCapacity > 0 && totalPlanned > totalCapacity ? "critical" : committedPlans.length > 0 ? "healthy" : "neutral",
      href: `/initiatives/${initiativeId}/workspace/sprint-preparation`,
      cells: [
        cell("executive", `${committedPlans.length} committed sprint plans`, `${totalPlanned} points planned against ${totalCapacity} capacity.`),
        cell("product_owner", `${readyItems} sprint-ready items`, `${stories.length + bugs.length - readyItems} items do not have a current ready decision.`),
        cell("delivery_team", `${sprints.length} sprints available`, `${stories.filter((story) => story.sprintId).length} stories are assigned to a sprint.`),
        cell("stakeholder", `${committedPlans.length} delivery commitments`, "Committed plans reflect explicit Product Owner decisions."),
      ],
    },
    {
      id: "quality",
      domain: "Quality & bugs",
      metric: String(openBugs.length),
      label: "Open bugs",
      health: healthFromCount(severeBugs.length),
      href: `/initiatives/${initiativeId}/workspace/refinement`,
      cells: [
        cell("executive", `${severeBugs.length} high-severity open`, `${openBugs.length} open bugs may affect release confidence.`),
        cell("product_owner", `${bugs.filter((bug) => bug.readinessStatus === "ready").length} bugs ready`, "Triage severity, priority, ownership, and release impact."),
        cell("delivery_team", `${bugs.filter((bug) => bug.owner).length}/${bugs.length} bugs owned`, "Unowned defects create unclear follow-up."),
        cell("stakeholder", `${bugs.length} tracked defects`, "Bug status stays connected to the originating request and planning scope."),
      ],
    },
    {
      id: "risk",
      domain: "Risk & dependencies",
      metric: String(activeBlockers.length + severeRisks.length),
      label: "Material concerns",
      health: healthFromCount(activeBlockers.length + severeRisks.length),
      href: `/initiatives/${initiativeId}/workspace/refinement`,
      cells: [
        cell("executive", `${severeRisks.length} severe risks`, `${activeBlockers.length} active blockers need visibility.`),
        cell("product_owner", `${openDecisions.length} decisions open`, "Resolve scope and priority choices that are blocking progress."),
        cell("delivery_team", `${dependencyCount} dependencies`, `${activeBlockers.filter((blocker) => blocker.owner).length}/${activeBlockers.length} blockers have owners.`),
        cell("stakeholder", `${activeRisks.length} active risks`, "Owners and mitigation status clarify where stakeholder help is needed."),
      ],
    },
    {
      id: "refinement",
      domain: "Refinement & decisions",
      metric: String(openQuestions.length + openActions.length),
      label: "Open follow-ups",
      health: openQuestions.length + openActions.length > 0 ? "watch" : "healthy",
      href: `/initiatives/${initiativeId}/workspace/refinement`,
      cells: [
        cell("executive", `${decisions.filter((decision) => decision.decidedAt).length} decisions recorded`, `${openDecisions.length} remain unresolved.`),
        cell("product_owner", `${refinementSessions.length} refinement sessions`, `${openQuestions.length} questions and ${openActions.length} actions remain open.`),
        cell("delivery_team", `${openQuestions.length} engineering questions`, "Answers, estimates, and scope outcomes stay attached to refinement."),
        cell("stakeholder", `${openActions.length} follow-up actions`, "Assigned follow-ups make meeting outcomes visible."),
      ],
    },
    {
      id: "engagement",
      domain: "People & engagement",
      metric: String(new Set(assignments.map((assignment) => assignment.stakeholder.id)).size),
      label: "People represented",
      health: assignments.length > 0 ? "healthy" : "watch",
      href: "/teams",
      cells: [
        cell("executive", `${assignments.filter((assignment) => assignment.influence === "high").length} high-influence assignments`, "See who must stay close to major decisions."),
        cell("product_owner", `${assignments.length} accountable assignments`, "Roles describe planning responsibility without granting system access."),
        cell("delivery_team", `${assignments.filter((assignment) => ["engineer", "technical_owner", "demo_owner"].includes(assignment.productRole)).length} delivery roles`, "Clarify technical ownership and demo responsibility."),
        cell("stakeholder", `${assignments.filter((assignment) => assignment.interest === "high").length} high-interest assignments`, "Engagement expectations make communication deliberate."),
      ],
    },
    {
      id: "evidence",
      domain: "Evidence & systems",
      metric: String(sourcedRequests + documents.length),
      label: "Traceable inputs",
      health: requests.length > 0 && sourcedRequests === 0 ? "watch" : "healthy",
      href: `/initiatives/${initiativeId}/workspace/documents`,
      cells: [
        cell("executive", integration ? `${integration.provider.name} ${integration.status}` : "No execution integration", integration?.lastSyncAt ? `Last sync ${integration.lastSyncAt.toLocaleDateString()}.` : "No completed sync is recorded."),
        cell("product_owner", `${sourcedRequests}/${requests.length} requests traceable`, `${documents.filter((document) => document.status === "analyzed").length}/${documents.length} documents analyzed.`),
        cell("delivery_team", `${sourceRecords.length} source records`, "Original evidence remains available when requirements are clarified."),
        cell("stakeholder", `${documents.length} supporting documents`, "Approved context can be traced back to its source."),
      ],
    },
  ];

  const accountabilityByPerson = new Map<string, AccountabilityRow>();
  for (const assignment of assignments) {
    const person = accountabilityByPerson.get(assignment.stakeholder.id) ?? {
      id: assignment.stakeholder.id,
      name: assignment.stakeholder.displayName,
      company: assignment.stakeholder.company,
      external: assignment.stakeholder.external,
      influence: assignment.influence,
      interest: assignment.interest,
      roles: [],
      planning: 0,
      delivery: 0,
      governance: 0,
      engagementExpectation: assignment.engagementExpectation,
    };
    const role = roleLabel(assignment.productRole);
    if (!person.roles.includes(role)) person.roles.push(role);
    if (assignment.planningRequestId || assignment.capabilityId) person.planning += 1;
    if (assignment.storyId || assignment.sprintId || assignment.releaseId) person.delivery += 1;
    if (assignment.decisionId || assignment.refinementSessionId) person.governance += 1;
    if (assignment.influence === "high") person.influence = "high";
    if (assignment.interest === "high") person.interest = "high";
    if (!person.engagementExpectation && assignment.engagementExpectation) person.engagementExpectation = assignment.engagementExpectation;
    accountabilityByPerson.set(person.id, person);
  }

  const attention: MatrixAttentionItem[] = [
    ...activeBlockers.map((blocker) => ({ id: `blocker:${blocker.id}`, severity: "critical" as const, title: blocker.description, context: `Blocker · ${blocker.status.replace("_", " ")}`, owner: blocker.owner?.name ?? null, href: `/initiatives/${initiativeId}/workspace/refinement` })),
    ...severeBugs.map((bug) => ({ id: `bug:${bug.id}`, severity: "critical" as const, title: requestTitle(bug.request.data), context: `${roleLabel(bug.severity)} severity bug · ${bug.status.replace("_", " ")}`, owner: bug.owner?.name ?? null, href: `/initiatives/${initiativeId}/workspace/refinement` })),
    ...severeRisks.map((risk) => ({ id: `risk:${risk.id}`, severity: "warning" as const, title: risk.description, context: `${roleLabel(risk.severity)} risk · ${risk.status}`, owner: risk.owner?.name ?? null, href: "/risks" })),
    ...openQuestions.map((question) => ({ id: `question:${question.id}`, severity: "warning" as const, title: question.question, context: `Open refinement question · ${question.session}`, owner: question.owner?.name ?? null, href: `/initiatives/${initiativeId}/workspace/refinement` })),
    ...openActions.map((action) => ({ id: `action:${action.id}`, severity: "info" as const, title: action.title, context: `Refinement action · ${action.session}`, owner: action.owner?.name ?? null, href: `/initiatives/${initiativeId}/workspace/refinement` })),
  ].slice(0, 12);

  const sourceCounts = new Map<string, number>();
  for (const source of sourceRecords) sourceCounts.set(source.type, (sourceCounts.get(source.type) ?? 0) + 1);
  sourceCounts.set("supporting_document", documents.length);
  if (integration) sourceCounts.set(`${integration.provider.name.toLowerCase()}_integration`, 1);

  return {
    generatedAt: new Date().toISOString(),
    initiative: { id: initiative.id, name: initiative.name, projectName: initiative.project.name, methodology: initiative.methodology },
    summary: {
      features: capabilities.length,
      stories: stories.length,
      readyItems,
      openBugs: openBugs.length,
      openBlockers: activeBlockers.length,
      people: accountabilityByPerson.size,
    },
    rows,
    accountability: [...accountabilityByPerson.values()].sort((a, b) => a.name.localeCompare(b.name)),
    attention,
    sourceCoverage: [...sourceCounts.entries()].map(([label, count]) => ({ label: roleLabel(label), count })).sort((a, b) => b.count - a.count),
  };
}
