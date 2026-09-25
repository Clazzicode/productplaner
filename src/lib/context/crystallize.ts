import type { Prisma } from "@prisma/client";
import { parseBudgetNumber } from "./conflictDetection";
import { capabilityUpsertSchema, riskCreateSchema } from "@/lib/validation/schemas";

type Tx = Prisma.TransactionClient;

// Document Import & Approved Context (directive items 18/26/27). The
// fieldKey -> real-write dispatch table: approving a ContextItem writes
// immediately into the real Project/Initiative/IntakeAnswerSet/Capability/
// Risk row it represents, rather than into a second, parallel "structured
// context" store — this is what makes "future planning reads the approved
// context first" (item 19) true for free. Always call inside the same
// transaction as the ContextItem's own status update (see the approve/
// resolve-conflict routes) so approval status and the real write can never
// diverge.

// Matches CapabilityForm's own initial state (recovered from the prior
// ImportIntakePanel.tsx, which used the same defaults for an unscored
// imported capability) — an approved feature with no AI-supplied
// effort/value/risk behaves exactly like a freshly hand-added one.
const CAPABILITY_DEFAULTS = { isMvp: true, effortSize: "m", businessValue: "high", riskLevel: "medium" } as const;

// Dependency auto-wiring is a stated scope cut (matching free-text
// against existing Capability names is a fragile NLP-matching problem this
// feature does not attempt) — validate everything else, never `dependsOn`.
const capabilityCrystallizeSchema = capabilityUpsertSchema.omit({ dependsOn: true });

export interface CrystallizeTarget {
  organizationId: string;
  projectId: string;
  initiativeId: string | null;
  fieldKey: string;
}

function safeParseJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function requireInitiativeId(item: CrystallizeTarget): string {
  if (!item.initiativeId) {
    throw new Error(`ContextItem.fieldKey "${item.fieldKey}" requires an initiativeId but this item has none.`);
  }
  return item.initiativeId;
}

// Exported for reuse by src/lib/ai/assist/apply (Section 4) — an AI Assist
// "feature_proposal"/"risk_observation" item applies through the exact same
// write an approved ContextItem does, so an AI-Assisted feature/risk behaves
// identically to a document-derived one. No parallel implementation.
export async function crystallizeFeature(tx: Tx, initiativeId: string, chosenValueJson: string): Promise<string> {
  const raw = safeParseJsonObject(chosenValueJson);
  const fields = capabilityCrystallizeSchema.parse({
    name: raw.name,
    description: raw.description ?? "",
    isMvp: raw.isMvp ?? CAPABILITY_DEFAULTS.isMvp,
    effortSize: raw.effortSize ?? CAPABILITY_DEFAULTS.effortSize,
    businessValue: raw.businessValue ?? CAPABILITY_DEFAULTS.businessValue,
    riskLevel: raw.riskLevel ?? CAPABILITY_DEFAULTS.riskLevel,
  });
  const intake = await tx.intakeAnswerSet.findUniqueOrThrow({
    where: { initiativeId },
    include: { capabilities: { select: { order: true } } },
  });
  const nextOrder = intake.capabilities.reduce((m, c) => Math.max(m, c.order + 1), 0);
  const created = await tx.capability.create({
    data: { intakeAnswerSetId: intake.id, ...fields, order: nextOrder },
    select: { id: true },
  });
  return created.id;
}

export async function crystallizeRisk(tx: Tx, item: CrystallizeTarget, chosenValueJson: string): Promise<string> {
  const raw = safeParseJsonObject(chosenValueJson);
  const parsed = riskCreateSchema.parse({
    description: raw.description,
    severity: raw.severity ?? "medium",
    initiativeId: item.initiativeId,
  });
  const created = await tx.risk.create({
    data: {
      organizationId: item.organizationId,
      projectId: item.projectId,
      initiativeId: parsed.initiativeId ?? null,
      description: parsed.description,
      severity: parsed.severity,
      ownerUserId: null, // document-derived — no natural owner, unlike a user manually filing one
    },
    select: { id: true },
  });
  return created.id;
}

export async function crystallize(tx: Tx, item: CrystallizeTarget, chosenValue: string): Promise<void> {
  switch (item.fieldKey) {
    case "project_name":
      await tx.project.update({ where: { id: item.projectId }, data: { name: chosenValue } });
      return;
    case "description":
      await tx.project.update({ where: { id: item.projectId }, data: { description: chosenValue } });
      return;
    case "goal":
      await tx.project.update({ where: { id: item.projectId }, data: { goal: chosenValue } });
      return;
    case "budget": {
      const budget = parseBudgetNumber(chosenValue);
      if (budget == null) throw new Error("Invalid budget value.");
      await tx.project.update({ where: { id: item.projectId }, data: { budget } });
      return;
    }
    case "projected_go_live": {
      const date = new Date(chosenValue);
      if (Number.isNaN(date.getTime())) throw new Error("Invalid date value.");
      await tx.project.update({ where: { id: item.projectId }, data: { targetLaunchDate: date } });
      return;
    }
    case "team": {
      // Project.teamCompositionJson was, until this feature, write-less
      // (confirmed zero other read/write sites anywhere in the app) — no
      // existing consumer shape to match, so { notes: string[] } (append,
      // never overwrite) is a fresh design decision, consistent with how
      // constraints/stakeholders already behave below.
      const project = await tx.project.findUniqueOrThrow({
        where: { id: item.projectId },
        select: { teamCompositionJson: true },
      });
      const current = safeParseJsonObject(project.teamCompositionJson);
      const notes = Array.isArray(current.notes) ? (current.notes as unknown[]) : [];
      await tx.project.update({
        where: { id: item.projectId },
        data: { teamCompositionJson: JSON.stringify({ ...current, notes: [...notes, chosenValue] }) },
      });
      return;
    }
    case "constraints": {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: item.projectId },
        select: { constraintsJson: true },
      });
      const current = safeParseJsonArray(project.constraintsJson);
      await tx.project.update({
        where: { id: item.projectId },
        data: { constraintsJson: JSON.stringify([...current, chosenValue]) },
      });
      return;
    }
    case "stakeholders": {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: item.projectId },
        select: { stakeholdersJson: true },
      });
      const current = safeParseJsonArray(project.stakeholdersJson);
      await tx.project.update({
        where: { id: item.projectId },
        data: { stakeholdersJson: JSON.stringify([...current, chosenValue]) },
      });
      return;
    }
    case "initiative_name":
      await tx.initiative.update({ where: { id: requireInitiativeId(item) }, data: { name: chosenValue } });
      return;
    case "initiative_goal":
      await tx.intakeAnswerSet.update({
        where: { initiativeId: requireInitiativeId(item) },
        data: { outcomeStatement: chosenValue },
      });
      return;
    case "success_measure":
      await tx.intakeAnswerSet.update({
        where: { initiativeId: requireInitiativeId(item) },
        data: { outcomeMetric: chosenValue },
      });
      return;
    case "initiative_target_date": {
      const date = new Date(chosenValue);
      if (Number.isNaN(date.getTime())) throw new Error("Invalid date value.");
      // An override, per Section 2's resolveInitiativeEconomics() pattern —
      // never writes Project.targetLaunchDate from an initiative-scoped item.
      await tx.initiative.update({
        where: { id: requireInitiativeId(item) },
        data: { targetLaunchDateOverride: date },
      });
      return;
    }
    case "feature":
      await crystallizeFeature(tx, requireInitiativeId(item), chosenValue);
      return;
    case "risk":
      await crystallizeRisk(tx, item, chosenValue);
      return;
    case "dependency":
    case "assumption":
      // Traceability-only, deliberately no real write — see module comment.
      return;
    default:
      throw new Error(`Unknown ContextItem.fieldKey: "${item.fieldKey}"`);
  }
}
