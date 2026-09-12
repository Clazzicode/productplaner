"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";
import { readOnboardingState } from "@/lib/onboarding/tempStateClient";
import { LEGACY_QUALIFYING_PROFILE_DEFAULTS } from "@/lib/questionnaire/legacyQualifyingDefaults";
import { MIN_PROBLEM_CHARS } from "@/lib/generation/constants";
import type { WorkingRole } from "@/lib/onboarding/types";
import type { SimplifiedExperienceLevel } from "@/lib/onboarding/experienceOptions";
import { BEGINNER_INTAKE_COPY, SOME_EXPERIENCE_INTAKE_COPY } from "./simplifiedIntakeCopy";
import { ChoiceCard, ChoicePill } from "./Choice";
import { FIELD_CLASS } from "./fieldStyles";
import { ButtonLoader, GenerationProgress } from "@/components/ui/loading";
import Button from "@/components/ui/Button";
import {
  AUDIENCE_CHIP_OPTIONS,
  BEGINNER_TIMELINE_OPTIONS,
  SOME_EXPERIENCE_TIMELINE_OPTIONS,
  DEFAULT_TARGET_CUSTOMER,
  buildCapabilityPlan,
  buildCapabilityPlanAllMvp,
  capabilityFieldsForBucket,
  composeTargetCustomer,
  computeTargetLaunchDate,
  defaultTeamSize,
  deriveInitiativeName,
  deriveOutcomeStatement,
  finalizeOutcomeStatement,
  parseFeatureLines,
  type CapabilityPlanItem,
  type TimelineBucket,
} from "@/lib/questionnaire/simplifiedIntakeTranslate";

type MethodologyChoice = "agile_scrum" | "waterfall" | "hybrid" | "recommend";

// Guided-activation restructure (reference doc §16): matches genStep, which
// the real submit() sequence advances as each actual API call starts — not
// a timer, so a step only ever shows "in progress" while genuinely in flight.
const GENERATION_STEPS = [
  "Analyzing your answers",
  "Organizing features",
  "Creating roadmap structure",
  "Preparing delivery plan",
];

const METHODOLOGY_OPTIONS: { value: MethodologyChoice; label: string; hint: string }[] = [
  { value: "agile_scrum", label: "Agile", hint: "Fixed-length sprints, a prioritized backlog." },
  { value: "waterfall", label: "Waterfall", hint: "Sequenced phases, locked in order." },
  { value: "hybrid", label: "Hybrid", hint: "Waterfall structure with an agile delivery layer." },
  { value: "recommend", label: "Recommend one for me", hint: "We'll pick a sensible default." },
];

function ReviewBlock(props: { label: string; items: CapabilityPlanItem[]; onEdit: () => void; empty: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">{props.label}</span>
        <button type="button" onClick={props.onEdit} className="text-xs font-medium text-accent hover:underline">
          Edit
        </button>
      </div>
      {props.items.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {props.items.map((item) => (
            <li key={item.name} className="text-sm text-text-secondary">
              • {item.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-text-muted">{props.empty}</p>
      )}
    </div>
  );
}

function ProgressHeader(props: { step: number; totalSteps: number; reviewLabel?: string }) {
  const onReview = props.step === props.totalSteps - 1;
  return (
    <div className="mb-9">
      <div className="mb-2.5 flex items-baseline justify-between gap-4">
        <p className="text-xs font-medium text-text-muted">
          <span className="font-semibold text-text-primary">
            {onReview ? (props.reviewLabel ?? "Review") : `Question ${props.step + 1} of ${props.totalSteps - 1}`}
          </span>
        </p>
        <p className="text-xs font-semibold tabular-nums text-accent">
          {Math.round(((props.step + 1) / props.totalSteps) * 100)}%
        </p>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: props.totalSteps }).map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= props.step ? "bg-accent" : "bg-neutral-200"}`} />
        ))}
      </div>
    </div>
  );
}

/**
 * The simplified intake flow for Beginner / Some Experience users, writing
 * into the same Initiative / IntakeAnswerSet / Capability records (via the
 * existing API routes) that the advanced PlanningQuestionnaire produces. No
 * MVP/business-value/risk/dependency/methodology terminology appears
 * anywhere in the Beginner copy.
 *
 * Guided-activation restructure (reference doc §4/§5): Beginner (7 screens:
 * product/audience/features/priority/next/timeline/review) and Some
 * Experience (6 screens: product/outcome/features/methodology/timeline/
 * review) now ask genuinely different questions — previously identical
 * content with only tone differences. This is also now reached directly from
 * onboarding's Role step (not just from "New Initiative"), since answering it
 * creates the first Initiative as part of the guided activation sequence.
 */
export default function SimplifiedIntakeWizard(props: {
  hasProfile: boolean;
  workingRole: WorkingRole | null;
  experienceLevel: SimplifiedExperienceLevel;
  teamComposition?: string | null;
}) {
  const router = useRouter();
  const isBeginner = props.experienceLevel === "first_time";

  const [step, setStep] = useState(0);
  const [productAnswer, setProductAnswer] = useState("");
  const [audienceChips, setAudienceChips] = useState<string[]>([]);
  const [audienceDetail, setAudienceDetail] = useState("");
  const [outcomeAnswer, setOutcomeAnswer] = useState("");
  const [featuresAnswer, setFeaturesAnswer] = useState("");
  const [priorityAnswer, setPriorityAnswer] = useState("");
  const [nextAnswer, setNextAnswer] = useState("");
  const [methodology, setMethodology] = useState<MethodologyChoice | null>(null);
  const [timeline, setTimeline] = useState<TimelineBucket | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const derivedName = useMemo(() => deriveInitiativeName(productAnswer), [productAnswer]);
  const initiativeName = nameOverride ?? derivedName;

  const capabilityPlan = useMemo(
    () =>
      isBeginner
        ? buildCapabilityPlan(featuresAnswer, priorityAnswer, nextAnswer)
        : buildCapabilityPlanAllMvp(featuresAnswer),
    [isBeginner, featuresAnswer, priorityAnswer, nextAnswer],
  );
  const nowItems = capabilityPlan.filter((i) => i.bucket === "now");
  const nextItems = capabilityPlan.filter((i) => i.bucket === "next");
  const laterItems = capabilityPlan.filter((i) => i.bucket === "later");

  // Beginner: product, audience, features, priority, next, timeline, review (7).
  // Some Experience: product, outcome, features, methodology, timeline, review (6).
  const TOTAL_STEPS = isBeginner ? 7 : 6;
  const reviewStep = TOTAL_STEPS - 1;

  const canContinue = isBeginner
    ? step === 0
      ? productAnswer.trim().length >= MIN_PROBLEM_CHARS
      : step === 3
        ? parseFeatureLines(priorityAnswer).length > 0
        : step === 5
          ? timeline !== null
          : true
    : step === 0
      ? productAnswer.trim().length >= MIN_PROBLEM_CHARS
      : step === 1
        ? outcomeAnswer.trim().length >= 5
        : step === 2
          ? parseFeatureLines(featuresAnswer).length > 0
          : step === 3
            ? methodology !== null
            : step === 4
              ? timeline !== null
              : true;

  const toggleAudienceChip = (chip: string) =>
    setAudienceChips((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));

  const submit = async () => {
    if (timeline == null) return;
    setSubmitting(true);
    setGenStep(0); // "Analyzing your answers"
    setError(null);

    const onboardingWorkspaceType = readOnboardingState().workspaceType;
    const resolvedTeamComposition = props.teamComposition ?? (onboardingWorkspaceType === "solo" ? "solo" : "small_team");

    if (!props.hasProfile) {
      const profileRes = await apiFetch("/api/qualifying", {
        method: "POST",
        body: {
          ...LEGACY_QUALIFYING_PROFILE_DEFAULTS,
          teamComposition: resolvedTeamComposition,
          productType: "software_product",
          experienceLevel: props.experienceLevel,
        },
      });
      if (!profileRes.ok) {
        setSubmitting(false);
        setError(profileRes.error ?? "Could not save your setup.");
        return;
      }
    }

    const targetLaunchDate = computeTargetLaunchDate(timeline);
    const initRes = await apiFetch<{ initiativeId: string }>("/api/initiatives", {
      method: "POST",
      body: {
        name: initiativeName,
        description: productAnswer.trim(),
        ...(targetLaunchDate ? { targetLaunchDate: targetLaunchDate.toISOString() } : {}),
      },
    });
    if (!initRes.ok || !initRes.data) {
      setSubmitting(false);
      setError(initRes.error ?? "Could not create the initiative.");
      return;
    }
    const { initiativeId } = initRes.data;

    if (!isBeginner && methodology && methodology !== "recommend") {
      // Safe to call before generation — it just sets Initiative.methodology
      // and takes effect on first generation (see the route's own comment).
      await apiFetch(`/api/initiatives/${initiativeId}/methodology`, {
        method: "POST",
        body: { methodology },
      });
    }

    const intakeRes = await apiFetch(`/api/initiatives/${initiativeId}/intake`, {
      method: "PATCH",
      body: {
        problemStatement: productAnswer.trim(),
        targetCustomer: isBeginner ? composeTargetCustomer(audienceChips, audienceDetail) : DEFAULT_TARGET_CUSTOMER,
        outcomeStatement: isBeginner
          ? deriveOutcomeStatement(priorityAnswer, productAnswer)
          : finalizeOutcomeStatement(outcomeAnswer),
        teamSize: defaultTeamSize(resolvedTeamComposition),
      },
    });
    if (!intakeRes.ok) {
      setSubmitting(false);
      setError(intakeRes.error ?? "Could not save your answers.");
      return;
    }

    setGenStep(1); // "Organizing features"
    for (const item of capabilityPlan) {
      const capRes = await apiFetch(`/api/initiatives/${initiativeId}/capabilities`, {
        method: "POST",
        body: {
          name: item.name,
          description: "",
          ...capabilityFieldsForBucket(item.bucket),
          mvpImportance: null,
          customerImpactScore: null,
          revenueImpactScore: null,
          strategicAlignmentScore: null,
          riskComplianceScore: null,
          dependsOn: [],
        },
      });
      if (!capRes.ok) {
        setSubmitting(false);
        setError(capRes.error ?? `Could not save "${item.name}".`);
        return;
      }
    }

    setGenStep(2); // "Creating roadmap structure" — the long-running step
    const genRes = await apiFetch(`/api/initiatives/${initiativeId}/generate`, { method: "POST", body: {} });
    if (!genRes.ok) {
      setSubmitting(false);
      setError(genRes.error ?? "Could not build your plan. Your answers are saved — you can try again from the initiative page.");
      return;
    }
    setGenStep(3); // "Preparing delivery plan"

    router.push(`/initiatives/${initiativeId}/review`);
    router.refresh();
  };

  const timelineOptions = isBeginner ? BEGINNER_TIMELINE_OPTIONS : SOME_EXPERIENCE_TIMELINE_OPTIONS;
  const reviewCopy = isBeginner ? BEGINNER_INTAKE_COPY.review : SOME_EXPERIENCE_INTAKE_COPY.review;

  return (
    <div className="mx-auto max-w-2xl">
      <ProgressHeader step={step} totalSteps={TOTAL_STEPS} />

      <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-md md:p-10">
        {isBeginner ? (
          <>
            {step === 0 && (
              <label className="block">
                <span className="text-2xl font-semibold tracking-tight text-text-primary">
                  {BEGINNER_INTAKE_COPY.product.title}
                </span>
                <p className="mt-2 mb-3 text-sm leading-relaxed text-text-secondary">
                  {BEGINNER_INTAKE_COPY.product.hint}
                </p>
                <textarea
                  value={productAnswer}
                  onChange={(e) => setProductAnswer(e.target.value)}
                  rows={4}
                  placeholder={BEGINNER_INTAKE_COPY.product.placeholder}
                  className={`w-full ${FIELD_CLASS}`}
                  autoFocus
                />
              </label>
            )}

            {step === 1 && (
              <div>
                <span className="block text-2xl font-semibold tracking-tight text-text-primary">
                  {BEGINNER_INTAKE_COPY.audience.title}
                </span>
                <p className="mt-2 mb-4 text-sm leading-relaxed text-text-secondary">
                  {BEGINNER_INTAKE_COPY.audience.hint}
                </p>
                <div className="flex flex-wrap gap-2">
                  {AUDIENCE_CHIP_OPTIONS.map((chip) => (
                    <ChoicePill
                      key={chip}
                      selected={audienceChips.includes(chip)}
                      onClick={() => toggleAudienceChip(chip)}
                      label={chip}
                    />
                  ))}
                </div>
                <textarea
                  value={audienceDetail}
                  onChange={(e) => setAudienceDetail(e.target.value)}
                  rows={2}
                  placeholder="Anything else, in your own words (optional)"
                  className={`mt-4 w-full ${FIELD_CLASS}`}
                />
              </div>
            )}

            {step === 2 && (
              <label className="block">
                <span className="text-2xl font-semibold tracking-tight text-text-primary">
                  {BEGINNER_INTAKE_COPY.features.title}
                </span>
                <p className="mt-2 mb-3 text-sm leading-relaxed text-text-secondary">
                  {BEGINNER_INTAKE_COPY.features.hint}
                </p>
                <textarea
                  value={featuresAnswer}
                  onChange={(e) => setFeaturesAnswer(e.target.value)}
                  rows={6}
                  placeholder={BEGINNER_INTAKE_COPY.features.placeholder}
                  className={`w-full ${FIELD_CLASS}`}
                  autoFocus
                />
              </label>
            )}

            {step === 3 && (
              <label className="block">
                <span className="text-2xl font-semibold tracking-tight text-text-primary">
                  {BEGINNER_INTAKE_COPY.priority.title}
                </span>
                <p className="mt-2 mb-3 text-sm leading-relaxed text-text-secondary">
                  {BEGINNER_INTAKE_COPY.priority.hint}
                </p>
                <textarea
                  value={priorityAnswer}
                  onChange={(e) => setPriorityAnswer(e.target.value)}
                  rows={4}
                  placeholder={BEGINNER_INTAKE_COPY.priority.placeholder}
                  className={`w-full ${FIELD_CLASS}`}
                  autoFocus
                />
              </label>
            )}

            {step === 4 && (
              <label className="block">
                <span className="text-2xl font-semibold tracking-tight text-text-primary">
                  {BEGINNER_INTAKE_COPY.next.title}
                </span>
                <p className="mt-2 mb-3 text-sm leading-relaxed text-text-secondary">
                  {BEGINNER_INTAKE_COPY.next.hint}
                </p>
                <textarea
                  value={nextAnswer}
                  onChange={(e) => setNextAnswer(e.target.value)}
                  rows={4}
                  placeholder={BEGINNER_INTAKE_COPY.next.placeholder}
                  className={`w-full ${FIELD_CLASS}`}
                  autoFocus
                />
              </label>
            )}

            {step === 5 && (
              <div>
                <span className="block text-2xl font-semibold tracking-tight text-text-primary">
                  {BEGINNER_INTAKE_COPY.timeline.title}
                </span>
                <p className="mt-2 mb-5 text-sm leading-relaxed text-text-secondary">
                  {BEGINNER_INTAKE_COPY.timeline.hint}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {timelineOptions.map((o) => (
                    <ChoiceCard
                      key={o.value}
                      selected={timeline === o.value}
                      onClick={() => setTimeline(o.value)}
                      label={o.label}
                    />
                  ))}
                </div>
              </div>
            )}

            {step === reviewStep && (
              <div>
                {submitting ? (
                  <GenerationProgress title="Building your plan" steps={GENERATION_STEPS} currentStep={genStep} />
                ) : (
                  <>
                    <h2 className="text-2xl font-semibold tracking-tight text-text-primary">{reviewCopy.title}</h2>
                    <div className="mt-6 space-y-5">
                      <label className="block">
                        <span className="text-sm font-medium text-text-primary">Product name</span>
                        <input
                          value={initiativeName}
                          onChange={(e) => setNameOverride(e.target.value)}
                          className={`mt-1.5 w-full ${FIELD_CLASS}`}
                        />
                      </label>
                      <ReviewBlock
                        label="What ships first"
                        items={nowItems}
                        onEdit={() => setStep(3)}
                        empty="Nothing yet — go back and tell us what's most important."
                      />
                      <ReviewBlock
                        label="What's next"
                        items={nextItems}
                        onEdit={() => setStep(4)}
                        empty="Nothing yet — that's okay, you can add this later."
                      />
                      <ReviewBlock label="Later" items={laterItems} onEdit={() => setStep(2)} empty="Nothing yet." />
                      <div>
                        <span className="text-sm font-medium text-text-primary">Target timing</span>
                        <p className="mt-1 text-sm text-text-secondary">
                          Aiming for the first part to be ready{" "}
                          {timelineOptions.find((o) => o.value === timeline)?.label.toLowerCase()}.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {step === 0 && (
              <label className="block">
                <span className="text-2xl font-semibold tracking-tight text-text-primary">
                  {SOME_EXPERIENCE_INTAKE_COPY.product.title}
                </span>
                <p className="mt-2 mb-3 text-sm leading-relaxed text-text-secondary">
                  {SOME_EXPERIENCE_INTAKE_COPY.product.hint}
                </p>
                <textarea
                  value={productAnswer}
                  onChange={(e) => setProductAnswer(e.target.value)}
                  rows={4}
                  placeholder={SOME_EXPERIENCE_INTAKE_COPY.product.placeholder}
                  className={`w-full ${FIELD_CLASS}`}
                  autoFocus
                />
              </label>
            )}

            {step === 1 && (
              <label className="block">
                <span className="text-2xl font-semibold tracking-tight text-text-primary">
                  {SOME_EXPERIENCE_INTAKE_COPY.outcome.title}
                </span>
                <p className="mt-2 mb-3 text-sm leading-relaxed text-text-secondary">
                  {SOME_EXPERIENCE_INTAKE_COPY.outcome.hint}
                </p>
                <textarea
                  value={outcomeAnswer}
                  onChange={(e) => setOutcomeAnswer(e.target.value)}
                  rows={3}
                  placeholder={SOME_EXPERIENCE_INTAKE_COPY.outcome.placeholder}
                  className={`w-full ${FIELD_CLASS}`}
                  autoFocus
                />
              </label>
            )}

            {step === 2 && (
              <label className="block">
                <span className="text-2xl font-semibold tracking-tight text-text-primary">
                  {SOME_EXPERIENCE_INTAKE_COPY.features.title}
                </span>
                <p className="mt-2 mb-3 text-sm leading-relaxed text-text-secondary">
                  {SOME_EXPERIENCE_INTAKE_COPY.features.hint}
                </p>
                <textarea
                  value={featuresAnswer}
                  onChange={(e) => setFeaturesAnswer(e.target.value)}
                  rows={6}
                  placeholder={SOME_EXPERIENCE_INTAKE_COPY.features.placeholder}
                  className={`w-full ${FIELD_CLASS}`}
                  autoFocus
                />
              </label>
            )}

            {step === 3 && (
              <div>
                <span className="block text-2xl font-semibold tracking-tight text-text-primary">
                  {SOME_EXPERIENCE_INTAKE_COPY.methodology.title}
                </span>
                <p className="mt-2 mb-5 text-sm leading-relaxed text-text-secondary">
                  {SOME_EXPERIENCE_INTAKE_COPY.methodology.hint}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {METHODOLOGY_OPTIONS.map((o) => (
                    <ChoiceCard
                      key={o.value}
                      selected={methodology === o.value}
                      onClick={() => setMethodology(o.value)}
                      label={o.label}
                      hint={o.hint}
                    />
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <span className="block text-2xl font-semibold tracking-tight text-text-primary">
                  {SOME_EXPERIENCE_INTAKE_COPY.timeline.title}
                </span>
                <p className="mt-2 mb-5 text-sm leading-relaxed text-text-secondary">
                  {SOME_EXPERIENCE_INTAKE_COPY.timeline.hint}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {timelineOptions.map((o) => (
                    <ChoiceCard
                      key={o.value}
                      selected={timeline === o.value}
                      onClick={() => setTimeline(o.value)}
                      label={o.label}
                    />
                  ))}
                </div>
              </div>
            )}

            {step === reviewStep && (
              <div>
                {submitting ? (
                  <GenerationProgress title="Building your plan" steps={GENERATION_STEPS} currentStep={genStep} />
                ) : (
                  <>
                    <h2 className="text-2xl font-semibold tracking-tight text-text-primary">{reviewCopy.title}</h2>
                    <div className="mt-6 space-y-5">
                      <label className="block">
                        <span className="text-sm font-medium text-text-primary">Product name</span>
                        <input
                          value={initiativeName}
                          onChange={(e) => setNameOverride(e.target.value)}
                          className={`mt-1.5 w-full ${FIELD_CLASS}`}
                        />
                      </label>
                      <ReviewBlock
                        label="What you're delivering"
                        items={nowItems}
                        onEdit={() => setStep(2)}
                        empty="Nothing yet — go back and list what needs to be delivered."
                      />
                      <div>
                        <span className="text-sm font-medium text-text-primary">Planning approach</span>
                        <p className="mt-1 text-sm text-text-secondary">
                          {METHODOLOGY_OPTIONS.find((o) => o.value === methodology)?.label}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-text-primary">Target timing</span>
                        <p className="mt-1 text-sm text-text-secondary">
                          Aiming for the first part to be ready{" "}
                          {timelineOptions.find((o) => o.value === timeline)?.label.toLowerCase()}.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {error && (
          <div className="mt-4">
            <p className="text-sm text-red-600">{error}</p>
            <p className="mt-1 text-xs text-text-muted">Your answers are saved — nothing is lost.</p>
          </div>
        )}

        {/* Hidden while submitting — GenerationProgress above is the only
            feedback needed, and there's nothing useful to click mid-generation. */}
        {!submitting && (
          <div className="mt-8 flex items-center justify-between">
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
                ← Back
              </Button>
            ) : (
              <div />
            )}
            {step < reviewStep ? (
              <Button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canContinue}
                className="px-6 py-3"
              >
                Continue →
              </Button>
            ) : (
              <ButtonLoader
                type="button"
                onClick={() => void submit()}
                loading={submitting}
                loadingLabel={reviewCopy.busy.replace(/…$/, "")}
                className="px-6 py-3"
              >
                {reviewCopy.cta}
              </ButtonLoader>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
