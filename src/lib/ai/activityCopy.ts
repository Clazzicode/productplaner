import type { AiActionKey, AiJobStatus } from "./types";

// Plain-language copy for AI Assist's activity/progress UI (Section 4 §7-9).
// Deliberately no implementation terms (embeddings/RAG/inference/vectors/
// prompt chains/tokens/context windows) anywhere in these strings — only
// "reviewing," "checking," "organizing," "building," "validating," "saving."
// Referenced by AiAssistPanel (pre-generation AiActivityPanel explanation)
// and useAiJobPolling (live GenerationProgress steps), never by an action
// module itself — those only ever write the underlying AiJobStatus.

/** Ordered, user-visible stages for the AI Assist generation pipeline.
 * "queued"/"validating_access" happen before/around the request and aren't
 * shown as their own step — the panel is already showing "Generate" ->
 * spinner by the time either would be true. */
export const AI_ASSIST_STEP_ORDER: AiJobStatus[] = [
  "loading_context",
  "checking_gaps",
  "building_recommendation",
  "validating_output",
  "saving_artifact",
  "completed",
];

export const JOB_STATUS_STEP_LABEL: Record<AiJobStatus, string> = {
  queued: "Starting",
  validating_access: "Checking access",
  loading_context: "Reviewing approved project and initiative information",
  processing_sources: "Reviewing source material",
  extracting_information: "Reading information",
  checking_gaps: "Checking for anything already covered",
  waiting_for_user: "Waiting for more information",
  building_recommendation: "Building the suggestion",
  validating_output: "Double-checking the result",
  saving_artifact: "Saving as a draft for your review",
  completed: "Done",
  failed: "Something went wrong",
  cancelled: "Cancelled",
};

/** Maps a live AiJobStatus onto {steps, currentStep} for GenerationProgress
 * — never a fake timer/percentage (Section 4 §8-9). A status outside
 * AI_ASSIST_STEP_ORDER (e.g. "failed") reports currentStep at the last
 * reached position so the checklist doesn't regress. */
export function stepsForJobStatus(status: AiJobStatus): { steps: string[]; currentStep: number } {
  const steps = AI_ASSIST_STEP_ORDER.map((s) => JOB_STATUS_STEP_LABEL[s]);
  const idx = AI_ASSIST_STEP_ORDER.indexOf(status);
  return { steps, currentStep: idx >= 0 ? idx : steps.length - 1 };
}

interface AssistActionCopy {
  /** Short label for the "Generate" affordance, e.g. the button/slot title. */
  title: string;
  /** Pre-generation AiActivityPanel explanation — what AI is about to do,
   * what it will use, and that nothing changes without review (Section 4 §6). */
  explanation: string;
}

export const AI_ASSIST_ACTION_COPY: Record<AiActionKey, AssistActionCopy> = {
  ANALYZE_INTAKE: {
    title: "Analyze intake",
    explanation: "Reviews this initiative's intake answers and summarizes them.",
  },
  DOCUMENT_UNDERSTANDING: {
    title: "Analyze document",
    explanation: "Reads the uploaded document and proposes facts for your review.",
  },
  ROADMAP_INSIGHTS: {
    title: "Check roadmap for concerns",
    explanation:
      "Reviews your approved plan, features, and dependencies for timing or sequencing concerns. Nothing on your roadmap changes — you'll see a short note you can review, apply, or dismiss.",
  },
  PROPOSE_FEATURES: {
    title: "Suggest features you may be missing",
    explanation:
      "Looks at your approved features, problem statement, and target customer to suggest features you may be missing. Nothing is added to your plan until you review and apply a suggestion.",
  },
  PROPOSE_STORY_CONTENT: {
    title: "Suggest better story wording",
    explanation:
      "Reviews this feature's current epics, stories, and acceptance criteria and suggests clearer wording. Sizing, sprint assignment, and ordering are never touched — only titles and descriptions, and only if you apply the suggestion.",
  },
  PROPOSE_DEPENDENCIES: {
    title: "Check for missing dependencies",
    explanation:
      "Compares your approved features against their existing dependency links and suggests ones that may be missing. Nothing is linked until you review and apply a suggestion.",
  },
  PROPOSE_RISKS: {
    title: "Suggest risks to consider",
    explanation:
      "Reviews your problem statement, target customer, and approved features for risks worth tracking. Nothing is added to your risk list until you review and apply a suggestion.",
  },
  RECOMMEND_RELEASES: {
    title: "Recommend release grouping",
    explanation:
      "Reviews your approved features and target date for a possible release grouping. This is a recommendation only — applying it opens the normal release form for you to confirm.",
  },
  RECOMMEND_SPRINTS: {
    title: "Recommend sprint structure",
    explanation:
      "Uses your team size and velocity (never invented) to suggest sprint structure. If that information isn't entered yet, you'll be asked for it instead of a guess.",
  },
  RECOMMEND_STATUS: {
    title: "Explain status recommendation",
    explanation:
      "Turns the platform's own status recommendation into a plain-language explanation of why. It never sets the status itself — you accept or keep the current one.",
  },
};
