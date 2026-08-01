import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { buildPlan, packSprints } from "./buildPlan";
import { EPIC_NAME_SUFFIXES, PHASE_NAMES, RELEASE_NAMES } from "./constants";
import {
  buildEpicSeeds,
  buildNarrativeContext,
  buildACsForStory,
  buildStoriesForEpic,
  type NarrativeContext,
} from "./decompose";
import { computeEffectiveCapacity } from "./cost";
import { validateIntake } from "./validateIntake";
import {
  LAYER_SEQUENCE,
  type CapabilityInput,
  type IntakeInput,
  type IntakeValidation,
  type LayerType,
  type PlannedEpic,
  type PlannedFeature,
  type PlannedStory,
} from "./types";

type Db = PrismaClient | Prisma.TransactionClient;

export class IntakeInvalidError extends Error {
  constructor(public validation: IntakeValidation) {
    super("Intake has unresolved validation flags");
  }
}

/** Generation starts the plan clock on the next Monday. */
export function nextMonday(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return d;
}

/** Load the stored intake (FR-06 structured data model) as engine input. */
export async function loadIntakeInput(initiativeId: string): Promise<IntakeInput> {
  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: initiativeId },
    include: {
      intakeAnswerSet: {
        include: {
          capabilities: { orderBy: { order: "asc" }, include: { dependsOnEdges: true } },
        },
      },
    },
  });
  const intake = initiative.intakeAnswerSet;
  if (!intake) throw new Error("Initiative has no intake answer set");
  return {
    initiativeName: initiative.name,
    problemStatement: intake.problemStatement,
    targetCustomer: intake.targetCustomer,
    outcomeStatement: intake.outcomeStatement,
    outcomeMetric: intake.outcomeMetric,
    teamSize: intake.teamSize ?? 0,
    sprintLengthWeeks: intake.sprintLengthWeeks,
    velocityPerPersonPerSprint: intake.velocityPerPersonPerSprint,
    capacityBufferPercent: intake.capacityBufferPercent,
    hoursPerSprintPerMember: intake.hoursPerSprintPerMember,
    utilizationRatePercent: intake.utilizationRatePercent,
    hoursPerStoryPoint: intake.hoursPerStoryPoint,
    historicalVelocityPoints: intake.historicalVelocityPoints,
    startDate: nextMonday(),
    capabilities: intake.capabilities.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      isMvp: c.isMvp,
      effortSize: c.effortSize as CapabilityInput["effortSize"],
      businessValue: c.businessValue as CapabilityInput["businessValue"],
      riskLevel: c.riskLevel as CapabilityInput["riskLevel"],
      mvpImportance: c.mvpImportance as CapabilityInput["mvpImportance"],
      businessValueScore: c.businessValueScore,
      order: c.order,
      dependsOn: c.dependsOnEdges.map((e) => e.toCapabilityId),
    })),
  };
}

// ---------- trace notes (FR-10) ----------

const traceFor = {
  roadmap: () => ({
    keys: "q1,q3",
    note: "Framed by your problem statement (Q1) and sequenced against the outcome you want to achieve (Q3).",
  }),
  phase: (phaseNumber: number) => ({
    keys: "q3,q4",
    note: `${PHASE_NAMES[phaseNumber] ?? "Phase"} — scoped by your MVP answers (Q4) and sequenced against the outcome (Q3).`,
  }),
  feature: (cap: { name: string; isMvp: boolean }) => ({
    keys: "q4",
    note: `From capability "${cap.name}" — marked ${cap.isMvp ? "required for MVP" : "post-MVP"} in intake (Q4).`,
  }),
  epic: (cap: { name: string; effortSize: string }) => ({
    keys: "q1,q4,q6",
    note: `Work package scoped from "${cap.name}" — the ${cap.effortSize.toUpperCase()} effort answer (Q6) sets how many epics it decomposes into.`,
  }),
  story: (cap: { businessValue: string }) => ({
    keys: "q2,q3,q6,q8",
    note: `Persona from Q2, benefit from Q3, points from effort (Q6), priority informed by business value (Q8: ${cap.businessValue}).`,
  }),
  ac: () => ({
    keys: "q2,q3",
    note: "Testable Given/When/Then conditions derived from the Q2 persona and the Q3 outcome.",
  }),
};

// ---------- tree creation helpers (shared by generate + regenerate) ----------

async function createStoryTree(
  tx: Db,
  args: {
    prototypeId: string;
    parentEpicId: string;
    story: PlannedStory;
    order: number;
    cap: CapabilityInput;
    sprintIdByNumber: Map<number, string>;
  },
): Promise<void> {
  const { prototypeId, parentEpicId, story, order, cap, sprintIdByNumber } = args;
  const trace = traceFor.story(cap);
  const storyRow = await tx.artifactLayer.create({
    data: {
      prototypeId,
      type: "story",
      parentId: parentEpicId,
      order,
      title: story.title,
      body: story.body,
      points: story.points,
      contentJson: JSON.stringify({
        persona: story.persona,
        want: story.want,
        benefit: story.benefit,
      }),
      sourceCapabilityId: cap.id,
      traceAnswerKeys: trace.keys,
      traceNote: trace.note,
      sprintId: sprintIdByNumber.get(story.sprintNumber) ?? null,
    },
  });
  const acTrace = traceFor.ac();
  for (const [ai, ac] of story.acs.entries()) {
    await tx.artifactLayer.create({
      data: {
        prototypeId,
        type: "acceptance_criterion",
        parentId: storyRow.id,
        order: ai,
        title: ac.title,
        body: ac.body,
        contentJson: JSON.stringify({ kind: ac.kind }),
        sourceCapabilityId: cap.id,
        traceAnswerKeys: acTrace.keys,
        traceNote: acTrace.note,
      },
    });
  }
}

async function createEpicTree(
  tx: Db,
  args: {
    prototypeId: string;
    parentFeatureId: string;
    epic: PlannedEpic;
    epicIndex: number;
    epicCount: number;
    cap: CapabilityInput;
    sprintIdByNumber: Map<number, string>;
  },
): Promise<void> {
  const { prototypeId, parentFeatureId, epic, epicIndex, epicCount, cap, sprintIdByNumber } = args;
  const trace = traceFor.epic(cap);
  const epicRow = await tx.artifactLayer.create({
    data: {
      prototypeId,
      type: "epic",
      parentId: parentFeatureId,
      order: epicIndex,
      title: epic.title,
      body: epic.body,
      contentJson: JSON.stringify({ epicIndex, epicCount }),
      sourceCapabilityId: cap.id,
      traceAnswerKeys: trace.keys,
      traceNote: trace.note,
    },
  });
  for (const [si, story] of epic.stories.entries()) {
    await createStoryTree(tx, {
      prototypeId,
      parentEpicId: epicRow.id,
      story,
      order: si,
      cap,
      sprintIdByNumber,
    });
  }
}

async function createFeatureTree(
  tx: Db,
  args: {
    prototypeId: string;
    parentPhaseId: string;
    phaseNumber: number;
    feature: PlannedFeature;
    order: number;
    cap: CapabilityInput;
    sprintIdByNumber: Map<number, string>;
  },
): Promise<void> {
  const { prototypeId, parentPhaseId, phaseNumber, feature, order, cap, sprintIdByNumber } = args;
  const trace = traceFor.feature(cap);
  const featureRow = await tx.artifactLayer.create({
    data: {
      prototypeId,
      type: "feature",
      parentId: parentPhaseId,
      order,
      title: feature.title,
      body: feature.body,
      contentJson: JSON.stringify({ phaseNumber }),
      sourceCapabilityId: cap.id,
      traceAnswerKeys: trace.keys,
      traceNote: trace.note,
    },
  });
  for (const [ei, epic] of feature.epics.entries()) {
    await createEpicTree(tx, {
      prototypeId,
      parentFeatureId: featureRow.id,
      epic,
      epicIndex: ei,
      epicCount: feature.epics.length,
      cap,
      sprintIdByNumber,
    });
  }
}

// ---------- full generation (FR-08/FR-09) ----------

export async function generatePrototype(initiativeId: string): Promise<{ prototypeId: string }> {
  const intake = await loadIntakeInput(initiativeId);
  const validation = validateIntake(intake);
  if (validation.errors.length > 0) throw new IntakeInvalidError(validation);

  const plan = buildPlan(intake);
  const capById = new Map(intake.capabilities.map((c) => [c.id, c]));

  const prototypeId = await db.$transaction(
    async (tx) => {
      // Idempotent: regenerating from intake replaces any prior prototype.
      await tx.prototype.deleteMany({ where: { initiativeId } });
      const proto = await tx.prototype.create({ data: { initiativeId } });

      for (const [i, layerType] of LAYER_SEQUENCE.entries()) {
        await tx.layerLock.create({
          data: { prototypeId: proto.id, layerType, sequence: i + 1 },
        });
      }

      const releaseIdByPhase = new Map<number, string>();
      for (const rel of plan.releases) {
        const row = await tx.release.create({
          data: {
            prototypeId: proto.id,
            name: rel.name,
            phaseNumber: rel.phaseNumber,
            targetDate: rel.targetDate,
            order: rel.order,
          },
        });
        releaseIdByPhase.set(rel.phaseNumber, row.id);
      }

      const sprintIdByNumber = new Map<number, string>();
      for (const sprint of plan.sprints) {
        const row = await tx.sprint.create({
          data: {
            prototypeId: proto.id,
            sprintNumber: sprint.sprintNumber,
            phaseNumber: sprint.phaseNumber,
            startDate: sprint.startDate,
            endDate: sprint.endDate,
            capacityPoints: sprint.capacityPoints,
            releaseId: releaseIdByPhase.get(sprint.phaseNumber) ?? null,
          },
        });
        sprintIdByNumber.set(sprint.sprintNumber, row.id);
      }

      const rootTrace = traceFor.roadmap();
      const root = await tx.artifactLayer.create({
        data: {
          prototypeId: proto.id,
          type: "roadmap",
          order: 0,
          title: plan.roadmapTitle,
          body: plan.roadmapBody,
          traceAnswerKeys: rootTrace.keys,
          traceNote: rootTrace.note,
        },
      });

      for (const [pi, phase] of plan.phases.entries()) {
        const phaseTrace = traceFor.phase(phase.phaseNumber);
        const phaseRow = await tx.artifactLayer.create({
          data: {
            prototypeId: proto.id,
            type: "roadmap_phase",
            parentId: root.id,
            order: pi,
            title: phase.name,
            body: `${phase.features.length} ${phase.features.length === 1 ? "capability" : "capabilities"}, sequenced by dependencies and business value.`,
            contentJson: JSON.stringify({
              phaseNumber: phase.phaseNumber,
              startDate: phase.startDate.toISOString(),
              endDate: phase.endDate.toISOString(),
              capabilityIds: phase.capabilityIds,
            }),
            traceAnswerKeys: phaseTrace.keys,
            traceNote: phaseTrace.note,
          },
        });
        for (const [fi, feature] of phase.features.entries()) {
          const cap = capById.get(feature.capabilityId)!;
          await createFeatureTree(tx, {
            prototypeId: proto.id,
            parentPhaseId: phaseRow.id,
            phaseNumber: phase.phaseNumber,
            feature,
            order: fi,
            cap,
            sprintIdByNumber,
          });
        }
      }

      await tx.initiative.update({
        where: { id: initiativeId },
        data: { status: "generated" },
      });
      await tx.intakeAnswerSet.update({
        where: { initiativeId },
        data: { status: "generated", validatedAt: new Date() },
      });
      return proto.id;
    },
    { timeout: 120_000 },
  );

  return { prototypeId };
}

// ---------- downstream propagation (FR-11) ----------

export interface RegenStats {
  features: number;
  epics: number;
  stories: number;
  acs: number;
  sprints: number;
}

const parseJson = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/**
 * Full regenerate-and-replace of everything BELOW the edited layer, keeping
 * the (possibly user-edited) rows at and above it. Titles of surviving rows
 * feed the regenerated text, so upper-layer edits visibly propagate. The
 * agile layers (sprints/releases) are always recomputed afterwards.
 */
export async function regenerateBelow(
  prototypeId: string,
  editedLayer: LayerType,
): Promise<RegenStats> {
  const proto = await db.prototype.findUniqueOrThrow({
    where: { id: prototypeId },
    select: { initiativeId: true },
  });
  const intake = await loadIntakeInput(proto.initiativeId);
  const ctx = buildNarrativeContext(intake);
  const capById = new Map(intake.capabilities.map((c) => [c.id, c]));
  const stats: RegenStats = { features: 0, epics: 0, stories: 0, acs: 0, sprints: 0 };

  await db.$transaction(
    async (tx) => {
      if (editedLayer === "roadmap") {
        // Rebuild features (and everything beneath) under the surviving phases.
        await tx.artifactLayer.deleteMany({ where: { prototypeId, type: "feature" } });
        const phases = await tx.artifactLayer.findMany({
          where: { prototypeId, type: "roadmap_phase" },
          orderBy: { order: "asc" },
        });
        for (const phaseRow of phases) {
          const content = parseJson(phaseRow.contentJson);
          const capIds = (content.capabilityIds as string[] | undefined) ?? [];
          const caps = capIds
            .map((id) => capById.get(id))
            .filter((c): c is CapabilityInput => Boolean(c));
          for (const [fi, cap] of caps.entries()) {
            const feature = { ...decomposeForRegen(cap, ctx) };
            await createFeatureTree(tx, {
              prototypeId,
              parentPhaseId: phaseRow.id,
              phaseNumber: (content.phaseNumber as number | undefined) ?? 1,
              feature,
              order: fi,
              cap,
              sprintIdByNumber: new Map(),
            });
            stats.features += 1;
            stats.epics += feature.epics.length;
            for (const e of feature.epics) {
              stats.stories += e.stories.length;
              stats.acs += e.stories.reduce((n, s) => n + s.acs.length, 0);
            }
          }
        }
      } else if (editedLayer === "feature_hierarchy") {
        await tx.artifactLayer.deleteMany({ where: { prototypeId, type: "epic" } });
        const features = await tx.artifactLayer.findMany({
          where: { prototypeId, type: "feature" },
          orderBy: { order: "asc" },
        });
        for (const f of features) {
          const cap = f.sourceCapabilityId ? capById.get(f.sourceCapabilityId) : undefined;
          if (!cap) continue;
          // Edited feature titles feed the regenerated epics/stories.
          const seeds = buildEpicSeeds(cap, f.title);
          for (const seed of seeds) {
            const epic: PlannedEpic = {
              title: seed.title,
              body: seed.body,
              stories: buildStoriesForEpic({
                cap,
                featureTitle: f.title,
                epicIndex: seed.epicIndex,
                ctx,
              }),
            };
            await createEpicTree(tx, {
              prototypeId,
              parentFeatureId: f.id,
              epic,
              epicIndex: seed.epicIndex,
              epicCount: seeds.length,
              cap,
              sprintIdByNumber: new Map(),
            });
            stats.epics += 1;
            stats.stories += epic.stories.length;
            stats.acs += epic.stories.reduce((n, s) => n + s.acs.length, 0);
          }
        }
      } else if (editedLayer === "epics") {
        await tx.artifactLayer.deleteMany({ where: { prototypeId, type: "story" } });
        const epics = await tx.artifactLayer.findMany({
          where: { prototypeId, type: "epic" },
          orderBy: { order: "asc" },
          include: { parent: { select: { title: true } } },
        });
        for (const e of epics) {
          const cap = e.sourceCapabilityId ? capById.get(e.sourceCapabilityId) : undefined;
          if (!cap) continue;
          const content = parseJson(e.contentJson);
          // An epic still carrying its canonical generated name regenerates
          // stories from the clean feature title; a user-renamed epic feeds
          // its edited title into the stories so the edit visibly propagates.
          const canonical = EPIC_NAME_SUFFIXES.some(
            (sfx) => e.title === `${e.parent?.title} — ${sfx}`,
          );
          const stories = buildStoriesForEpic({
            cap,
            featureTitle: canonical ? (e.parent?.title ?? cap.name) : e.title,
            epicIndex: (content.epicIndex as number | undefined) ?? 0,
            ctx,
          });
          for (const [si, story] of stories.entries()) {
            await createStoryTree(tx, {
              prototypeId,
              parentEpicId: e.id,
              story,
              order: si,
              cap,
              sprintIdByNumber: new Map(),
            });
          }
          stats.stories += stories.length;
          stats.acs += stories.reduce((n, s) => n + s.acs.length, 0);
        }
      } else if (editedLayer === "stories") {
        await tx.artifactLayer.deleteMany({
          where: { prototypeId, type: "acceptance_criterion" },
        });
        const stories = await tx.artifactLayer.findMany({
          where: { prototypeId, type: "story" },
          orderBy: { order: "asc" },
        });
        const acTrace = traceFor.ac();
        for (const s of stories) {
          const content = parseJson(s.contentJson);
          const acs = buildACsForStory({
            persona: (content.persona as string | undefined) ?? ctx.persona,
            want: (content.want as string | undefined) ?? s.title,
            benefit: (content.benefit as string | undefined) ?? ctx.outcomeShort,
          });
          for (const [ai, ac] of acs.entries()) {
            await tx.artifactLayer.create({
              data: {
                prototypeId,
                type: "acceptance_criterion",
                parentId: s.id,
                order: ai,
                title: ac.title,
                body: ac.body,
                contentJson: JSON.stringify({ kind: ac.kind }),
                sourceCapabilityId: s.sourceCapabilityId,
                traceAnswerKeys: acTrace.keys,
                traceNote: acTrace.note,
              },
            });
          }
          stats.acs += acs.length;
        }
      }
      // acceptance_criteria is the leaf — nothing beneath except the agile layers.

      stats.sprints = await repackSprints(tx, prototypeId, intake);

      // Downstream waterfall locks reset — must be reviewed and re-locked in order.
      const idx = LAYER_SEQUENCE.indexOf(editedLayer);
      await tx.layerLock.updateMany({
        where: { prototypeId, sequence: { gt: idx + 1 } },
        data: { state: "unlocked" },
      });
    },
    { timeout: 120_000 },
  );

  return stats;
}

function decomposeForRegen(cap: CapabilityInput, ctx: NarrativeContext): PlannedFeature {
  const seeds = buildEpicSeeds(cap, cap.name);
  return {
    capabilityId: cap.id,
    title: cap.name,
    body: cap.description.trim().length > 0 ? cap.description.trim() : `Delivers the "${cap.name}" capability.`,
    isMvp: cap.isMvp,
    epics: seeds.map((seed) => ({
      title: seed.title,
      body: seed.body,
      stories: buildStoriesForEpic({
        cap,
        featureTitle: cap.name,
        epicIndex: seed.epicIndex,
        ctx,
      }),
    })),
  };
}

// ---------- agile-layer recompute (sprints, releases) ----------

/**
 * Rebuilds sprints and releases from the CURRENT story rows in strict
 * roadmap order. Manual sprint moves are reset — the agile layer is always
 * recomputed when the waterfall foundation moves.
 */
export async function repackSprints(
  tx: Db,
  prototypeId: string,
  intake: IntakeInput,
): Promise<number> {
  await tx.sprint.deleteMany({ where: { prototypeId } }); // SetNull clears story.sprintId
  await tx.release.deleteMany({ where: { prototypeId } });

  const rows = await tx.artifactLayer.findMany({
    where: { prototypeId, type: { in: ["roadmap_phase", "feature", "epic", "story"] } },
    orderBy: { order: "asc" },
    select: { id: true, type: true, parentId: true, order: true, points: true, contentJson: true },
  });
  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) {
    const list = byParent.get(r.parentId) ?? [];
    list.push(r);
    byParent.set(r.parentId, list);
  }
  const childrenOf = (id: string, type: string) =>
    (byParent.get(id) ?? []).filter((r) => r.type === type).sort((a, b) => a.order - b.order);

  const phaseRows = rows
    .filter((r) => r.type === "roadmap_phase")
    .sort((a, b) => a.order - b.order);

  const ordered: { rowId: string; shim: { points: number; sprintNumber: number }; phaseNumber: number }[] = [];
  for (const phase of phaseRows) {
    const phaseNumber = (parseJson(phase.contentJson).phaseNumber as number | undefined) ?? 1;
    for (const feature of childrenOf(phase.id, "feature")) {
      for (const epic of childrenOf(feature.id, "epic")) {
        for (const story of childrenOf(epic.id, "story")) {
          ordered.push({
            rowId: story.id,
            shim: { points: story.points ?? 1, sprintNumber: 0 },
            phaseNumber,
          });
        }
      }
    }
  }

  const capacityPoints = computeEffectiveCapacity(intake);
  const sprints = packSprints({
    stories: ordered.map((o) => ({ story: o.shim, phaseNumber: o.phaseNumber })),
    capacityPoints,
    sprintLengthWeeks: intake.sprintLengthWeeks,
    startDate: intake.startDate,
  });

  // Releases: one per phase present, cut at that phase's sprints.
  const releaseIdByPhase = new Map<number, string>();
  const phasesPresent = [...new Set(sprints.map((s) => s.phaseNumber))].sort((a, b) => a - b);
  for (const [i, phaseNumber] of phasesPresent.entries()) {
    const phaseSprints = sprints.filter((s) => s.phaseNumber === phaseNumber);
    const row = await tx.release.create({
      data: {
        prototypeId,
        name: RELEASE_NAMES[phaseNumber] ?? `Release ${i + 1}`,
        phaseNumber,
        targetDate: phaseSprints[phaseSprints.length - 1].endDate,
        order: i + 1,
      },
    });
    releaseIdByPhase.set(phaseNumber, row.id);
  }

  const sprintIdByNumber = new Map<number, string>();
  for (const sprint of sprints) {
    const row = await tx.sprint.create({
      data: {
        prototypeId,
        sprintNumber: sprint.sprintNumber,
        phaseNumber: sprint.phaseNumber,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        capacityPoints: sprint.capacityPoints,
        releaseId: releaseIdByPhase.get(sprint.phaseNumber) ?? null,
      },
    });
    sprintIdByNumber.set(sprint.sprintNumber, row.id);
  }

  for (const o of ordered) {
    await tx.artifactLayer.update({
      where: { id: o.rowId },
      data: { sprintId: sprintIdByNumber.get(o.shim.sprintNumber) ?? null },
    });
  }

  // Refresh phase date ranges from the repacked sprints (display data only —
  // sprint-layer changes never restructure locked waterfall rows, FR-18).
  for (const phase of phaseRows) {
    const content = parseJson(phase.contentJson);
    const phaseNumber = (content.phaseNumber as number | undefined) ?? 1;
    const phaseSprints = sprints.filter((s) => s.phaseNumber === phaseNumber);
    if (phaseSprints.length > 0) {
      await tx.artifactLayer.update({
        where: { id: phase.id },
        data: {
          contentJson: JSON.stringify({
            ...content,
            startDate: phaseSprints[0].startDate.toISOString(),
            endDate: phaseSprints[phaseSprints.length - 1].endDate.toISOString(),
          }),
        },
      });
    }
  }

  return sprints.length;
}
