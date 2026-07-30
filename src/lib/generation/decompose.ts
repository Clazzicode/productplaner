import {
  EFFORT_POINTS,
  EPIC_NAME_SUFFIXES,
  EPIC_TEMPLATE,
  STORY_WANTS,
} from "./constants";
import type {
  AcKind,
  CapabilityInput,
  PlannedAC,
  PlannedEpic,
  PlannedFeature,
  PlannedStory,
} from "./types";

/** Narrative context distilled from the global intake answers (Q1–Q3). */
export interface NarrativeContext {
  persona: string; // from Q2
  outcomeShort: string; // from Q3
}

const clip = (text: string, max: number): string => {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 20 ? lastSpace : max)}…`;
};

const lowerFirst = (t: string): string =>
  t.length > 1 && t[1] === t[1].toLowerCase() ? t[0].toLowerCase() + t.slice(1) : t;

const stripPeriod = (t: string): string => t.trim().replace(/[.!?]+$/, "");

export function buildNarrativeContext(input: {
  targetCustomer: string;
  outcomeStatement: string;
}): NarrativeContext {
  return {
    persona: lowerFirst(stripPeriod(clip(input.targetCustomer, 60))),
    outcomeShort: lowerFirst(stripPeriod(clip(input.outcomeStatement, 90))),
  };
}

export function buildFeatureForCapability(cap: CapabilityInput): Omit<PlannedFeature, "epics"> {
  return {
    capabilityId: cap.id,
    title: cap.name,
    body:
      cap.description.trim().length > 0
        ? cap.description.trim()
        : `Delivers the "${cap.name}" capability.`,
    isMvp: cap.isMvp,
  };
}

export interface EpicSeed {
  epicIndex: number;
  epicCount: number;
  storiesPerEpic: number;
  title: string;
  body: string;
}

/** Epic titles/counts come from the capability's effort size (Q6). */
export function buildEpicSeeds(cap: CapabilityInput, featureTitle: string): EpicSeed[] {
  const { epicCount, storiesPerEpic } = EPIC_TEMPLATE[cap.effortSize];
  return Array.from({ length: epicCount }, (_, i) => ({
    epicIndex: i,
    epicCount,
    storiesPerEpic,
    title: `${featureTitle} — ${EPIC_NAME_SUFFIXES[i]}`,
    body: `Work package ${i + 1} of ${epicCount} delivering "${featureTitle}" — ${EPIC_NAME_SUFFIXES[i].toLowerCase()}. Sized from the ${cap.effortSize.toUpperCase()} effort answer.`,
  }));
}

export function storyPointsFor(cap: CapabilityInput): number {
  const { epicCount, storiesPerEpic } = EPIC_TEMPLATE[cap.effortSize];
  return Math.max(1, Math.round(EFFORT_POINTS[cap.effortSize] / (epicCount * storiesPerEpic)));
}

const upperFirst = (t: string): string => (t.length ? t[0].toUpperCase() + t.slice(1) : t);

/** Stories for one epic. `featureTitle` feeds the "{cap}" placeholder, so an
 * edited feature/epic title visibly propagates into regenerated stories. */
export function buildStoriesForEpic(args: {
  cap: CapabilityInput;
  featureTitle: string;
  epicIndex: number;
  ctx: NarrativeContext;
}): PlannedStory[] {
  const { cap, featureTitle, epicIndex, ctx } = args;
  const { storiesPerEpic } = EPIC_TEMPLATE[cap.effortSize];
  const wants = STORY_WANTS[Math.min(epicIndex, STORY_WANTS.length - 1)];
  const points = storyPointsFor(cap);
  const benefit = ctx.outcomeShort;

  return Array.from({ length: storiesPerEpic }, (_, i) => {
    const want = wants[i % wants.length].replaceAll("{cap}", featureTitle);
    return {
      title: clip(upperFirst(want), 80),
      body: `As a ${ctx.persona}, I want to ${want}, so that ${benefit}.`,
      points,
      persona: ctx.persona,
      want,
      benefit,
      sprintNumber: 0, // assigned by the sprint packer
      acs: buildACsForStory({ persona: ctx.persona, want, benefit }),
    };
  });
}

/** Exactly 3 Given/When/Then criteria per story: happy path, validation, outcome check. */
export function buildACsForStory(story: {
  persona: string;
  want: string;
  benefit: string;
}): PlannedAC[] {
  const defs: { kind: AcKind; title: string; body: string }[] = [
    {
      kind: "happy",
      title: "AC1 — Happy path",
      body: `Given a ${story.persona} with valid input, when they ${story.want}, then the system completes the action and confirms success.`,
    },
    {
      kind: "validation",
      title: "AC2 — Validation",
      body: `Given required information is missing or invalid, when the ${story.persona} attempts to ${story.want}, then the system shows a plain-language validation message and does not proceed.`,
    },
    {
      kind: "edge",
      title: "AC3 — Outcome check",
      body: `Given the action has completed, when the ${story.persona} reviews the result, then the outcome supports "${story.benefit}".`,
    },
  ];
  return defs;
}

/** Full decomposition of one capability: feature → epics → stories → ACs. */
export function decomposeCapability(
  cap: CapabilityInput,
  ctx: NarrativeContext,
): PlannedFeature {
  const feature = buildFeatureForCapability(cap);
  const epics: PlannedEpic[] = buildEpicSeeds(cap, feature.title).map((seed) => ({
    title: seed.title,
    body: seed.body,
    stories: buildStoriesForEpic({
      cap,
      featureTitle: feature.title,
      epicIndex: seed.epicIndex,
      ctx,
    }),
  }));
  return { ...feature, epics };
}
