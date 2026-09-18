import type { Methodology } from "@/lib/generation/types";

// Product methodology/rules configuration (req #4, docs/V2-AI-FOUNDATION.md).
// Deliberately separate from systemPrompt.ts: this file is the domain rule
// set, not the assistant's identity. Every AI action's prompt combines
// systemPrompt.ts + GLOBAL_PRODUCT_PLANNING_RULES + (optionally)
// METHODOLOGY_AI_GUIDANCE[methodology].

// Enforces req #13 at the prompt level, on top of the structural enforcement
// in the response schema (no numeric/date fields to fill in) and in the
// action modules (never importing the deterministic engine's math).
export const GLOBAL_PRODUCT_PLANNING_RULES = `- Never state or imply a specific date, sprint number, story-point estimate, team-capacity figure, or dependency ordering — those are computed deterministically elsewhere in the platform and must not be second-guessed, restated, or approximated by you.
- Frame any "recommended roadmap phases" qualitatively (what belongs together, and why), never as a numbered sprint/release schedule.
- Treat every user-entered intake field (problem statement, target customer, outcome, capabilities) as ground truth to analyze — never something to rewrite, correct, or silently improve in place.
- Prefer naming a real gap or risk over producing a reassuring but shallow analysis. A short, honest "missing information" list is more useful than padding.`;

export const METHODOLOGY_AI_GUIDANCE: Record<Methodology, string> = {
  hybrid:
    "This initiative uses a hybrid methodology: an upfront roadmap/phase structure with agile execution underneath. Favor phase-level groupings that reflect meaningfully different stages of the plan, not a rigid fixed-scope breakdown.",
  agile_scrum:
    "This initiative uses Agile/Scrum: scope is expected to evolve, and the backlog is prioritized continuously rather than locked into a fixed multi-phase plan. Favor framing phases as priority horizons (what's addressed sooner vs. later), not fixed commitments.",
  waterfall:
    "This initiative uses Waterfall: once a phase's baseline is approved it becomes a fixed, sequential commitment. Favor being conservative and explicit about anything that looks under-specified now, since it will be much costlier to revisit once locked.",
  kanban:
    "This initiative uses Kanban: continuous flow with no fixed sprint boundaries. Favor framing phases as flow stages or thematic groupings rather than time-boxed increments.",
};
