import { randomUUID } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { buildPlan, packContinuousFlow, packSprints } from "./buildPlan";
import { EPIC_NAME_SUFFIXES, PHASE_NAMES, RELEASE_NAMES } from "./constants";
import {
  buildEpicSeeds,
  buildNarrativeContext,
  buildACsForStory,
  buildStoriesForEpic,
  type NarrativeContext,
} from "./decompose";
import { computeEffectiveCapacity } from "./cost";
import { METHODOLOGY_PROFILES, resolveMethodology } from "./methodology";
import { validateIntake } from "./validateIntake";
import {
  LAYER_SEQUENCE,
  type CapabilityInput,
  type IntakeInput,
  type IntakeValidation,
  type LayerType,
  type Methodology,
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

export class AgileLayerLockedError extends Error {}

/**
 * Waterfall's real behavioral difference: once the full baseline is
 * approved, the agile layer (sprints/releases) freezes too — a real fixed
 * schedule, not something you rebalance. Enforced only at user-initiated
 * mutation entry points (move-sprint route, assumptions route,
 * `recalculatePlan`'s all-locked case), never inside the internal repack
 * machinery — an unlock→edit→re-lock of a waterfall layer must still be able
 * to repack sprints internally.
 */
export async function assertAgileLayerEditable(initiativeId: string): Promise<void> {
  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: initiativeId },
    include: { prototype: { select: { approvedAt: true } } },
  });
  const profile = METHODOLOGY_PROFILES[resolveMethodology(initiative.methodology)];
  if (profile.agileLayerGate === "locked_after_baseline" && initiative.prototype?.approvedAt) {
    throw new AgileLayerLockedError(
      "This initiative's methodology is Waterfall — once the full baseline is approved, the sprint and release plan is a fixed schedule and can't be edited.",
    );
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
      manualPhaseOverride: c.manualPhaseOverride,
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
    note: `From feature "${cap.name}" — marked ${cap.isMvp ? "required for MVP" : "post-MVP"} in intake (Q4).`,
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
//
// These build plain row objects with client-generated ids instead of
// awaiting one `create()` per row: a hosted-Postgres round trip per
// feature/epic/story/AC made drag-and-drop moves and edits noticeably slow
// once a plan had more than a handful of features. Rows accumulate into a
// `TreeBatch` and are flushed with one `createMany` per layer type — parent
// rows must land before children because `parentId` is a real FK, so
// `flushTreeBatch` writes features, then epics, then stories, then ACs, in
// that order.

type ArtifactLayerRow = Prisma.ArtifactLayerCreateManyInput;

interface TreeBatch {
  features: ArtifactLayerRow[];
  epics: ArtifactLayerRow[];
  stories: ArtifactLayerRow[];
  acs: ArtifactLayerRow[];
}

function newTreeBatch(): TreeBatch {
  return { features: [], epics: [], stories: [], acs: [] };
}

async function flushTreeBatch(tx: Db, batch: TreeBatch): Promise<void> {
  if (batch.features.length > 0) await tx.artifactLayer.createMany({ data: batch.features });
  if (batch.epics.length > 0) await tx.artifactLayer.createMany({ data: batch.epics });
  if (batch.stories.length > 0) await tx.artifactLayer.createMany({ data: batch.stories });
  if (batch.acs.length > 0) await tx.artifactLayer.createMany({ data: batch.acs });
}

function addStoryTree(
  batch: TreeBatch,
  args: {
    prototypeId: string;
    parentEpicId: string;
    story: PlannedStory;
    order: number;
    cap: CapabilityInput;
    sprintIdByNumber: Map<number, string>;
  },
): void {
  const { prototypeId, parentEpicId, story, order, cap, sprintIdByNumber } = args;
  const trace = traceFor.story(cap);
  const storyId = randomUUID();
  batch.stories.push({
    id: storyId,
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
  });
  const acTrace = traceFor.ac();
  for (const [ai, ac] of story.acs.entries()) {
    batch.acs.push({
      id: randomUUID(),
      prototypeId,
      type: "acceptance_criterion",
      parentId: storyId,
      order: ai,
      title: ac.title,
      body: ac.body,
      contentJson: JSON.stringify({ kind: ac.kind }),
      sourceCapabilityId: cap.id,
      traceAnswerKeys: acTrace.keys,
      traceNote: acTrace.note,
    });
  }
}

function addEpicTree(
  batch: TreeBatch,
  args: {
    prototypeId: string;
    parentFeatureId: string;
    epic: PlannedEpic;
    epicIndex: number;
    epicCount: number;
    cap: CapabilityInput;
    sprintIdByNumber: Map<number, string>;
  },
): void {
  const { prototypeId, parentFeatureId, epic, epicIndex, epicCount, cap, sprintIdByNumber } = args;
  const trace = traceFor.epic(cap);
  const epicId = randomUUID();
  batch.epics.push({
    id: epicId,
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
  });
  for (const [si, story] of epic.stories.entries()) {
    addStoryTree(batch, {
      prototypeId,
      parentEpicId: epicId,
      story,
      order: si,
      cap,
      sprintIdByNumber,
    });
  }
}

function addFeatureTree(
  batch: TreeBatch,
  args: {
    prototypeId: string;
    parentPhaseId: string;
    phaseNumber: number;
    feature: PlannedFeature;
    order: number;
    cap: CapabilityInput;
    sprintIdByNumber: Map<number, string>;
  },
): void {
  const { prototypeId, parentPhaseId, phaseNumber, feature, order, cap, sprintIdByNumber } = args;
  const trace = traceFor.feature(cap);
  const featureId = randomUUID();
  batch.features.push({
    id: featureId,
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
  });
  for (const [ei, epic] of feature.epics.entries()) {
    addEpicTree(batch, {
      prototypeId,
      parentFeatureId: featureId,
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
  const [intake, initiativeRow] = await Promise.all([
    loadIntakeInput(initiativeId),
    db.initiative.findUniqueOrThrow({ where: { id: initiativeId }, select: { methodology: true } }),
  ]);
  const methodology = resolveMethodology(initiativeRow.methodology);
  const validation = validateIntake(intake);
  if (validation.errors.length > 0) throw new IntakeInvalidError(validation);

  const plan = buildPlan(intake, methodology);
  const capById = new Map(intake.capabilities.map((c) => [c.id, c]));

  const prototypeId = await db.$transaction(
    async (tx) => {
      // Idempotent: regenerating from intake replaces any prior prototype.
      await tx.prototype.deleteMany({ where: { initiativeId } });
      const proto = await tx.prototype.create({ data: { initiativeId } });

      await tx.layerLock.createMany({
        data: LAYER_SEQUENCE.map((layerType, i) => ({
          prototypeId: proto.id,
          layerType,
          sequence: i + 1,
        })),
      });

      const releaseRows = plan.releases.map((rel) => ({
        id: randomUUID(),
        prototypeId: proto.id,
        name: rel.name,
        phaseNumber: rel.phaseNumber,
        targetDate: rel.targetDate,
        order: rel.order,
      }));
      if (releaseRows.length > 0) await tx.release.createMany({ data: releaseRows });
      const releaseIdByPhase = new Map(releaseRows.map((r) => [r.phaseNumber, r.id]));

      const sprintRows = plan.sprints.map((sprint) => ({
        id: randomUUID(),
        prototypeId: proto.id,
        sprintNumber: sprint.sprintNumber,
        phaseNumber: sprint.phaseNumber,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        capacityPoints: sprint.capacityPoints,
        releaseId: releaseIdByPhase.get(sprint.phaseNumber) ?? null,
      }));
      if (sprintRows.length > 0) await tx.sprint.createMany({ data: sprintRows });
      const sprintIdByNumber = new Map(sprintRows.map((r) => [r.sprintNumber, r.id]));

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

      const phaseRows = plan.phases.map((phase, pi) => {
        const phaseTrace = traceFor.phase(phase.phaseNumber);
        return {
          id: randomUUID(),
          prototypeId: proto.id,
          type: "roadmap_phase",
          parentId: root.id,
          order: pi,
          title: phase.name,
          body: `${phase.features.length} ${phase.features.length === 1 ? "feature" : "features"}, sequenced by dependencies and business value.`,
          contentJson: JSON.stringify({
            phaseNumber: phase.phaseNumber,
            startDate: phase.startDate.toISOString(),
            endDate: phase.endDate.toISOString(),
            capabilityIds: phase.capabilityIds,
          }),
          traceAnswerKeys: phaseTrace.keys,
          traceNote: phaseTrace.note,
        };
      });
      if (phaseRows.length > 0) await tx.artifactLayer.createMany({ data: phaseRows });

      const batch = newTreeBatch();
      for (const [pi, phase] of plan.phases.entries()) {
        const parentPhaseId = phaseRows[pi].id;
        for (const [fi, feature] of phase.features.entries()) {
          const cap = capById.get(feature.capabilityId)!;
          addFeatureTree(batch, {
            prototypeId: proto.id,
            parentPhaseId,
            phaseNumber: phase.phaseNumber,
            feature,
            order: fi,
            cap,
            sprintIdByNumber,
          });
        }
      }
      await flushTreeBatch(tx, batch);

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
    select: { initiativeId: true, initiative: { select: { methodology: true } } },
  });
  const methodology = resolveMethodology(proto.initiative.methodology);
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
        const batch = newTreeBatch();
        for (const phaseRow of phases) {
          const content = parseJson(phaseRow.contentJson);
          const capIds = (content.capabilityIds as string[] | undefined) ?? [];
          const caps = capIds
            .map((id) => capById.get(id))
            .filter((c): c is CapabilityInput => Boolean(c));
          for (const [fi, cap] of caps.entries()) {
            const feature = { ...decomposeForRegen(cap, ctx) };
            addFeatureTree(batch, {
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
        await flushTreeBatch(tx, batch);
      } else if (editedLayer === "feature_hierarchy") {
        await tx.artifactLayer.deleteMany({ where: { prototypeId, type: "epic" } });
        const features = await tx.artifactLayer.findMany({
          where: { prototypeId, type: "feature" },
          orderBy: { order: "asc" },
        });
        const batch = newTreeBatch();
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
            addEpicTree(batch, {
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
        await flushTreeBatch(tx, batch);
      } else if (editedLayer === "epics") {
        await tx.artifactLayer.deleteMany({ where: { prototypeId, type: "story" } });
        const epics = await tx.artifactLayer.findMany({
          where: { prototypeId, type: "epic" },
          orderBy: { order: "asc" },
          include: { parent: { select: { title: true } } },
        });
        const batch = newTreeBatch();
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
            addStoryTree(batch, {
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
        await flushTreeBatch(tx, batch);
      } else if (editedLayer === "stories") {
        await tx.artifactLayer.deleteMany({
          where: { prototypeId, type: "acceptance_criterion" },
        });
        const stories = await tx.artifactLayer.findMany({
          where: { prototypeId, type: "story" },
          orderBy: { order: "asc" },
        });
        const acTrace = traceFor.ac();
        const acRows: ArtifactLayerRow[] = [];
        for (const s of stories) {
          const content = parseJson(s.contentJson);
          const acs = buildACsForStory({
            persona: (content.persona as string | undefined) ?? ctx.persona,
            want: (content.want as string | undefined) ?? s.title,
            benefit: (content.benefit as string | undefined) ?? ctx.outcomeShort,
          });
          for (const [ai, ac] of acs.entries()) {
            acRows.push({
              id: randomUUID(),
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
            });
          }
          stats.acs += acs.length;
        }
        if (acRows.length > 0) await tx.artifactLayer.createMany({ data: acRows });
      }
      // acceptance_criteria is the leaf — nothing beneath except the agile layers.

      stats.sprints = await repackSprints(tx, prototypeId, intake, methodology);

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
    body: cap.description.trim().length > 0 ? cap.description.trim() : `Delivers the "${cap.name}" feature.`,
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
 * recomputed when the waterfall foundation moves. Kanban (`sprintMode:
 * "continuous_flow"`) creates no `Sprint` rows at all — every story's
 * `sprintId` stays null, and `Release` dates come from cumulative-throughput
 * math instead of discrete sprint spans.
 */
export async function repackSprints(
  tx: Db,
  prototypeId: string,
  intake: IntakeInput,
  methodology: Methodology = "hybrid",
): Promise<number> {
  const profile = METHODOLOGY_PROFILES[resolveMethodology(methodology)];
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
  const packableStories = ordered.map((o) => ({ story: o.shim, phaseNumber: o.phaseNumber }));

  if (profile.sprintMode === "continuous_flow") {
    const flow = packContinuousFlow({
      stories: packableStories,
      capacityPoints,
      sprintLengthWeeks: intake.sprintLengthWeeks,
      startDate: intake.startDate,
    });
    // Every story's sprintId is already null here — the `sprint.deleteMany`
    // above SetNulls it, and Kanban never assigns one — so there's nothing
    // further to update on the story rows themselves.
    const phasesPresent = [...new Set(ordered.map((o) => o.phaseNumber))].sort((a, b) => a - b);
    const releaseRows = phasesPresent
      .map((phaseNumber, i) => {
        const targetDate = flow.releaseDateByPhase.get(phaseNumber);
        if (!targetDate) return null;
        return {
          id: randomUUID(),
          prototypeId,
          name: RELEASE_NAMES[phaseNumber] ?? `Release ${i + 1}`,
          phaseNumber,
          targetDate,
          order: i + 1,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
    if (releaseRows.length > 0) await tx.release.createMany({ data: releaseRows });

    for (const phase of phaseRows) {
      const content = parseJson(phase.contentJson);
      const phaseNumber = (content.phaseNumber as number | undefined) ?? 1;
      const range = flow.phaseDateRanges.get(phaseNumber);
      if (range) {
        await tx.artifactLayer.update({
          where: { id: phase.id },
          data: {
            contentJson: JSON.stringify({
              ...content,
              startDate: range.startDate.toISOString(),
              endDate: range.endDate.toISOString(),
            }),
          },
        });
      }
    }
    return 0; // zero Sprint rows for Kanban
  }

  const sprints = packSprints({
    stories: packableStories,
    capacityPoints,
    sprintLengthWeeks: intake.sprintLengthWeeks,
    startDate: intake.startDate,
  });

  // Releases: one per phase present, cut at that phase's sprints.
  const phasesPresent = [...new Set(sprints.map((s) => s.phaseNumber))].sort((a, b) => a - b);
  const releaseRows = phasesPresent.map((phaseNumber, i) => {
    const phaseSprints = sprints.filter((s) => s.phaseNumber === phaseNumber);
    return {
      id: randomUUID(),
      prototypeId,
      name: RELEASE_NAMES[phaseNumber] ?? `Release ${i + 1}`,
      phaseNumber,
      targetDate: phaseSprints[phaseSprints.length - 1].endDate,
      order: i + 1,
    };
  });
  if (releaseRows.length > 0) await tx.release.createMany({ data: releaseRows });
  const releaseIdByPhase = new Map(releaseRows.map((r) => [r.phaseNumber, r.id]));

  const sprintRows = sprints.map((sprint) => ({
    id: randomUUID(),
    prototypeId,
    sprintNumber: sprint.sprintNumber,
    phaseNumber: sprint.phaseNumber,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    capacityPoints: sprint.capacityPoints,
    releaseId: releaseIdByPhase.get(sprint.phaseNumber) ?? null,
  }));
  if (sprintRows.length > 0) await tx.sprint.createMany({ data: sprintRows });
  const sprintIdByNumber = new Map(sprintRows.map((r) => [r.sprintNumber, r.id]));

  // Group by resolved sprintId so each distinct sprint needs one updateMany
  // instead of one update per story row.
  const rowIdsBySprintId = new Map<string | null, string[]>();
  for (const o of ordered) {
    const sprintId = sprintIdByNumber.get(o.shim.sprintNumber) ?? null;
    const list = rowIdsBySprintId.get(sprintId) ?? [];
    list.push(o.rowId);
    rowIdsBySprintId.set(sprintId, list);
  }
  for (const [sprintId, rowIds] of rowIdsBySprintId) {
    await tx.artifactLayer.updateMany({ where: { id: { in: rowIds } }, data: { sprintId } });
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

// ---------- manual recalculation (the "living plan" demo action) ----------
// Distinct from FR-11's automatic re-lock propagation above: this is a
// user-triggered action from the workspace, available any time intake has
// changed, not only when unlocking/re-locking a specific layer.

export type RecalculateMode = "full" | "respect_locks";
export type RecalculateDetail =
  | "full"
  | "repack_only"
  | "regen_below"
  | "full_fallback_no_locks";

export class RecalculateBlockedError extends Error {}

export interface RecalculateResult {
  prototypeId: string;
  mode: RecalculateMode;
  detail: RecalculateDetail;
  regenerated?: RegenStats | null;
  sprintsRepacked?: number | null;
}

export type RespectLocksBranch =
  | { kind: "full_fallback_no_locks" }
  | { kind: "repack_only" }
  | { kind: "regen_below"; anchorLayer: LayerType };

/**
 * Pure branch-selection logic for `"respect_locks"` mode, kept separate from
 * `recalculatePlan` so it's unit-testable without a database. Locks always
 * form a contiguous locked-prefix of `LAYER_SEQUENCE` (enforced by
 * `unlockLayer` cascading downstream) — this never needs to handle gaps.
 */
export function determineRespectLocksBranch(
  locks: { layerType: string; state: string }[],
): RespectLocksBranch {
  const lockedTypes = LAYER_SEQUENCE.filter(
    (t) => locks.find((l) => l.layerType === t)?.state === "locked",
  );
  if (lockedTypes.length === 0) return { kind: "full_fallback_no_locks" };
  if (lockedTypes.length === LAYER_SEQUENCE.length) return { kind: "repack_only" };
  const anchorLayer = [...LAYER_SEQUENCE].reverse().find((t) => lockedTypes.includes(t))!;
  return { kind: "regen_below", anchorLayer };
}

/**
 * `regenerateBelow` trusts each existing `roadmap_phase` row's stored
 * `capabilityIds` — it can't notice a capability added/removed since the last
 * generation. Pure set-diff, unit-testable in isolation; reclassifying an
 * *existing* capability in a way that would move it to a different phase
 * isn't caught here — a documented gap, not a silent one (the confirmation
 * UI discloses it).
 */
export function capabilitySetDrifted(
  storedIds: Iterable<string>,
  currentIds: Iterable<string>,
): boolean {
  const stored = new Set(storedIds);
  const current = new Set(currentIds);
  const added = [...current].some((id) => !stored.has(id));
  const removed = [...stored].some((id) => !current.has(id));
  return added || removed;
}

/**
 * `"full"` re-runs generation from scratch (same as the original Generate step —
 * already safe to call again). `"respect_locks"` only touches unlocked layers
 * plus the always-flexible agile layer, per `determineRespectLocksBranch`.
 */
export async function recalculatePlan(
  initiativeId: string,
  mode: RecalculateMode,
): Promise<RecalculateResult> {
  if (mode === "full") {
    // generatePrototype never touches Capability rows — clear any Timeline
    // drag-and-drop phase overrides here so "Full regenerate" actually
    // discards them, matching what its confirm-modal copy promises
    // (RefreshBar.tsx). Must NOT run for the "respect_locks" mode's own
    // full_fallback_no_locks branch below — that path preserves overrides.
    const intake = await db.intakeAnswerSet.findUnique({
      where: { initiativeId },
      select: { id: true },
    });
    if (intake) {
      await db.capability.updateMany({
        where: { intakeAnswerSetId: intake.id },
        data: { manualPhaseOverride: null },
      });
    }
    const { prototypeId } = await generatePrototype(initiativeId);
    return { prototypeId, mode: "full", detail: "full" };
  }

  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: initiativeId },
    include: { prototype: { include: { layerLocks: true } } },
  });
  if (!initiative.prototype) {
    throw new Error("No prototype to recalculate — generate the plan first.");
  }
  const methodology = resolveMethodology(initiative.methodology);
  const prototypeId = initiative.prototype.id;
  const branch = determineRespectLocksBranch(
    initiative.prototype.layerLocks.map((l) => ({ layerType: l.layerType, state: l.state })),
  );

  if (branch.kind === "full_fallback_no_locks") {
    const { prototypeId: id } = await generatePrototype(initiativeId);
    return { prototypeId: id, mode: "respect_locks", detail: "full_fallback_no_locks" };
  }

  if (branch.kind === "repack_only") {
    // Waterfall's agile layer freezes once the baseline is approved — same
    // guard as the assumptions/move-sprint routes.
    await assertAgileLayerEditable(initiativeId);
    const intake = await loadIntakeInput(initiativeId);
    const sprints = await db.$transaction(
      (tx) => repackSprints(tx, prototypeId, intake, methodology),
      { timeout: 120_000 },
    );
    return { prototypeId, mode: "respect_locks", detail: "repack_only", sprintsRepacked: sprints };
  }

  await assertRecalculateSafe(initiativeId, prototypeId);
  const stats = await regenerateBelow(prototypeId, branch.anchorLayer);
  return { prototypeId, mode: "respect_locks", detail: "regen_below", regenerated: stats };
}

async function assertRecalculateSafe(initiativeId: string, prototypeId: string): Promise<void> {
  const [intake, phaseRows] = await Promise.all([
    loadIntakeInput(initiativeId),
    db.artifactLayer.findMany({
      where: { prototypeId, type: "roadmap_phase" },
      select: { contentJson: true },
    }),
  ]);
  const storedIds = phaseRows.flatMap(
    (p) => (parseJson(p.contentJson).capabilityIds as string[] | undefined) ?? [],
  );
  const currentIds = intake.capabilities.map((c) => c.id);
  if (capabilitySetDrifted(storedIds, currentIds)) {
    throw new RecalculateBlockedError(
      'Capabilities were added or removed since the roadmap was last generated — "Recalculate ' +
        '— respect my locks" can\'t re-shuffle a locked roadmap. Use Full regenerate instead.',
    );
  }
}
