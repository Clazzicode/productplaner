import { db } from "@/lib/db";
import { loadIntakeInput } from "@/lib/generation/engine";
import { resolveInitiativeEconomics } from "@/lib/projectContext";
import type { ContextTier } from "./types";

// Section 5 §2 — one DB-backed loader per context layer. Every function
// takes an explicit id, never an implicit "current user's stuff" — this is
// what makes cross-project/initiative isolation structural (§41/§42), not
// just a convention someone has to remember.

function safeParseJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadWorkspaceContextTier(organizationId: string): Promise<ContextTier> {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true, workspaceType: true, createdAt: true },
  });
  return {
    layer: "workspace",
    priority: 10,
    required: false,
    label: "Workspace",
    content: `Organization: ${org.name} (${org.workspaceType} workspace)`,
    sourceType: "Organization",
    sourceId: organizationId,
    sourceVersion: org.createdAt.toISOString(),
  };
}

/** These are exactly the fields crystallize.ts (src/lib/context/crystallize.ts)
 * treats as "approved project facts" — reading the live column *is* reading
 * the approved value, by construction (§6's "crystallize once, retrieve
 * directly" is already true for these fields). */
export async function loadProjectContextTier(projectId: string): Promise<ContextTier> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      name: true,
      description: true,
      goal: true,
      budget: true,
      targetLaunchDate: true,
      teamCompositionJson: true,
      constraintsJson: true,
      stakeholdersJson: true,
      updatedAt: true,
    },
  });
  const team = safeParseJsonArray(project.teamCompositionJson).length > 0 ? "documented" : "not documented";
  const constraints = safeParseJsonArray(project.constraintsJson) as string[];
  const stakeholders = safeParseJsonArray(project.stakeholdersJson) as string[];

  const lines = [
    `Project: ${project.name}`,
    project.description ? `Description: ${project.description}` : null,
    project.goal ? `Goal: ${project.goal}` : null,
    project.budget != null ? `Budget: ${project.budget}` : null,
    project.targetLaunchDate ? `Target launch date: ${project.targetLaunchDate.toDateString()}` : null,
    `Team: ${team}`,
    constraints.length > 0 ? `Constraints: ${constraints.join("; ")}` : null,
    stakeholders.length > 0 ? `Stakeholders: ${stakeholders.join("; ")}` : null,
  ].filter((l): l is string => l != null);

  return {
    layer: "project",
    priority: 30,
    required: false,
    label: "Approved project information",
    content: lines.join("\n"),
    sourceType: "Project",
    sourceId: projectId,
    sourceVersion: project.updatedAt.toISOString(),
  };
}

export async function loadInitiativeContextTier(initiativeId: string): Promise<ContextTier> {
  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: initiativeId },
    select: {
      name: true,
      methodology: true,
      status: true,
      budgetOverride: true,
      averageHourlyRateOverride: true,
      targetLaunchDateOverride: true,
      updatedAt: true,
      project: { select: { budget: true, averageHourlyRate: true, targetLaunchDate: true } },
      intakeAnswerSet: {
        select: { problemStatement: true, targetCustomer: true, outcomeStatement: true, outcomeMetric: true },
      },
    },
  });
  const economics = resolveInitiativeEconomics(initiative, initiative.project);

  const lines = [
    `Initiative: ${initiative.name}`,
    `Methodology: ${initiative.methodology}`,
    `Status: ${initiative.status}`,
    economics.budget != null ? `Budget: ${economics.budget}` : null,
    economics.targetLaunchDate ? `Target launch date: ${economics.targetLaunchDate.toDateString()}` : null,
    initiative.intakeAnswerSet?.problemStatement ? `Problem statement: ${initiative.intakeAnswerSet.problemStatement}` : null,
    initiative.intakeAnswerSet?.targetCustomer ? `Target customer: ${initiative.intakeAnswerSet.targetCustomer}` : null,
    initiative.intakeAnswerSet?.outcomeStatement ? `Desired outcome: ${initiative.intakeAnswerSet.outcomeStatement}` : null,
    initiative.intakeAnswerSet?.outcomeMetric ? `Outcome metric: ${initiative.intakeAnswerSet.outcomeMetric}` : null,
  ].filter((l): l is string => l != null);

  return {
    layer: "initiative",
    priority: 50,
    required: false,
    label: "Approved initiative information",
    content: lines.join("\n"),
    sourceType: "Initiative",
    sourceId: initiativeId,
    sourceVersion: initiative.updatedAt.toISOString(),
  };
}

/** One code path for "the approved feature list" — calls the same
 * loadIntakeInput() the deterministic engine and analyzeIntake.ts already
 * use, formatted as a tier, rather than a second implementation. */
export async function loadApprovedFeaturesTier(initiativeId: string): Promise<ContextTier> {
  const intake = await loadIntakeInput(initiativeId);
  const lines = intake.capabilities.map(
    (c) =>
      `- ${c.name}${c.description ? `: ${c.description}` : ""} (${c.isMvp ? "MVP" : "not MVP"}, effort ${c.effortSize}, value ${c.businessValue}, depends on ${c.dependsOn.length} other feature${c.dependsOn.length === 1 ? "" : "s"})`,
  );
  return {
    layer: "initiative",
    priority: 40,
    required: false,
    label: "Approved features",
    content: lines.length > 0 ? lines.join("\n") : "(no approved features yet)",
    sourceType: "IntakeAnswerSet.capabilities",
    sourceId: initiativeId,
  };
}
