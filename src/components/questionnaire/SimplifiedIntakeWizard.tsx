"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";
import { readOnboardingState } from "@/lib/onboarding/tempStateClient";
import { LEGACY_QUALIFYING_PROFILE_DEFAULTS } from "@/lib/questionnaire/legacyQualifyingDefaults";
import { MIN_PROBLEM_CHARS } from "@/lib/generation/constants";
import type { WorkingRole } from "@/lib/onboarding/types";
import type { SimplifiedExperienceLevel } from "@/lib/onboarding/experienceOptions";
import { SIMPLIFIED_INTAKE_COPY } from "./simplifiedIntakeCopy";
import { ChoiceCard } from "./Choice";
import { FIELD_CLASS } from "./fieldStyles";
import Button from "@/components/ui/Button";
import {
  buildCapabilityPlan,
  capabilityFieldsForBucket,
  computeTargetLaunchDate,
  defaultTeamSize,
  deriveInitiativeName,
  deriveOutcomeStatement,
  DEFAULT_TARGET_CUSTOMER,
  parseFeatureLines,
  TIMELINE_OPTIONS,
  type CapabilityPlanItem,
  type TimelineBucket,
} from "@/lib/questionnaire/simplifiedIntakeTranslate";

const TOTAL_STEPS = 6; // 5 questions + review

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

/**
 * The simplified intake flow for Beginner / Some Experience users: 5 plain-
 * language questions + a review step, writing into the same Initiative /
 * IntakeAnswerSet / Capability records (via the existing API routes) that the
 * advanced PlanningQuestionnaire produces. No MVP/business-value/risk/
 * dependency/methodology terminology appears anywhere in this component.
 */
export default function SimplifiedIntakeWizard(props: {
  hasProfile: boolean;
  workingRole: WorkingRole | null;
  experienceLevel: SimplifiedExperienceLevel;
  teamComposition?: string | null;
}) {
  const router = useRouter();
  const copy = SIMPLIFIED_INTAKE_COPY[props.experienceLevel];

  const [step, setStep] = useState(0);
  const [productAnswer, setProductAnswer] = useState("");
  const [featuresAnswer, setFeaturesAnswer] = useState("");
  const [priorityAnswer, setPriorityAnswer] = useState("");
  const [nextAnswer, setNextAnswer] = useState("");
  const [timeline, setTimeline] = useState<TimelineBucket | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derivedName = useMemo(() => deriveInitiativeName(productAnswer), [productAnswer]);
  const initiativeName = nameOverride ?? derivedName;

  const capabilityPlan = useMemo(
    () => buildCapabilityPlan(featuresAnswer, priorityAnswer, nextAnswer),
    [featuresAnswer, priorityAnswer, nextAnswer],
  );
  const nowItems = capabilityPlan.filter((i) => i.bucket === "now");
  const nextItems = capabilityPlan.filter((i) => i.bucket === "next");
  const laterItems = capabilityPlan.filter((i) => i.bucket === "later");

  const canContinue =
    step === 0
      ? productAnswer.trim().length >= MIN_PROBLEM_CHARS
      : step === 2
        ? parseFeatureLines(priorityAnswer).length > 0
        : step === 4
          ? timeline !== null
          : true;

  const submit = async () => {
    if (timeline == null) return;
    setSubmitting(true);
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

    const initRes = await apiFetch<{ initiativeId: string }>("/api/initiatives", {
      method: "POST",
      body: {
        name: initiativeName,
        description: productAnswer.trim(),
        targetLaunchDate: computeTargetLaunchDate(timeline).toISOString(),
      },
    });
    if (!initRes.ok || !initRes.data) {
      setSubmitting(false);
      setError(initRes.error ?? "Could not create the initiative.");
      return;
    }
    const { initiativeId } = initRes.data;

    const intakeRes = await apiFetch(`/api/initiatives/${initiativeId}/intake`, {
      method: "PATCH",
      body: {
        problemStatement: productAnswer.trim(),
        targetCustomer: DEFAULT_TARGET_CUSTOMER,
        outcomeStatement: deriveOutcomeStatement(priorityAnswer, productAnswer),
        teamSize: defaultTeamSize(resolvedTeamComposition),
      },
    });
    if (!intakeRes.ok) {
      setSubmitting(false);
      setError(intakeRes.error ?? "Could not save your answers.");
      return;
    }

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

    const genRes = await apiFetch(`/api/initiatives/${initiativeId}/generate`, { method: "POST", body: {} });
    if (!genRes.ok) {
      setSubmitting(false);
      setError(genRes.error ?? "Could not build your plan. You can try again from the initiative page.");
      return;
    }

    router.push(`/initiatives/${initiativeId}/review`);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-9">
        <div className="mb-2.5 flex items-baseline justify-between gap-4">
          <p className="text-xs font-medium text-text-muted">
            <span className="font-semibold text-text-primary">
              {step < 5 ? `Question ${step + 1} of 5` : "Review"}
            </span>
          </p>
          <p className="text-xs font-semibold tabular-nums text-accent">
            {Math.round(((step + 1) / TOTAL_STEPS) * 100)}%
          </p>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-neutral-200"}`} />
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-md md:p-10">
        {step === 0 && (
          <label className="block">
            <span className="text-2xl font-semibold tracking-tight text-text-primary">{copy.product.title}</span>
            <p className="mt-2 mb-3 text-sm leading-relaxed text-text-secondary">{copy.product.hint}</p>
            <textarea
              value={productAnswer}
              onChange={(e) => setProductAnswer(e.target.value)}
              rows={4}
              placeholder={copy.product.placeholder}
              className={`w-full ${FIELD_CLASS}`}
              autoFocus
            />
          </label>
        )}

        {step === 1 && (
          <label className="block">
            <span className="text-2xl font-semibold tracking-tight text-text-primary">{copy.features.title}</span>
            <p className="mt-2 mb-3 text-sm leading-relaxed text-text-secondary">{copy.features.hint}</p>
            <textarea
              value={featuresAnswer}
              onChange={(e) => setFeaturesAnswer(e.target.value)}
              rows={6}
              placeholder={copy.features.placeholder}
              className={`w-full ${FIELD_CLASS}`}
              autoFocus
            />
          </label>
        )}

        {step === 2 && (
          <label className="block">
            <span className="text-2xl font-semibold tracking-tight text-text-primary">{copy.priority.title}</span>
            <p className="mt-2 mb-3 text-sm leading-relaxed text-text-secondary">{copy.priority.hint}</p>
            <textarea
              value={priorityAnswer}
              onChange={(e) => setPriorityAnswer(e.target.value)}
              rows={4}
              placeholder={copy.priority.placeholder}
              className={`w-full ${FIELD_CLASS}`}
              autoFocus
            />
          </label>
        )}

        {step === 3 && (
          <label className="block">
            <span className="text-2xl font-semibold tracking-tight text-text-primary">{copy.next.title}</span>
            <p className="mt-2 mb-3 text-sm leading-relaxed text-text-secondary">{copy.next.hint}</p>
            <textarea
              value={nextAnswer}
              onChange={(e) => setNextAnswer(e.target.value)}
              rows={4}
              placeholder={copy.next.placeholder}
              className={`w-full ${FIELD_CLASS}`}
              autoFocus
            />
          </label>
        )}

        {step === 4 && (
          <div>
            <span className="block text-2xl font-semibold tracking-tight text-text-primary">
              {copy.timeline.title}
            </span>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-text-secondary">{copy.timeline.hint}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {TIMELINE_OPTIONS.map((o) => (
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

        {step === 5 && (
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-text-primary">{copy.review.title}</h2>

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
                onEdit={() => setStep(2)}
                empty="Nothing yet — go back and tell us what's most important."
              />
              <ReviewBlock
                label="What's next"
                items={nextItems}
                onEdit={() => setStep(3)}
                empty="Nothing yet — that's okay, you can add this later."
              />
              <ReviewBlock label="Later" items={laterItems} onEdit={() => setStep(1)} empty="Nothing yet." />

              <div>
                <span className="text-sm font-medium text-text-primary">Target timing</span>
                <p className="mt-1 text-sm text-text-secondary">
                  Aiming for the first part to be ready{" "}
                  {TIMELINE_OPTIONS.find((o) => o.value === timeline)?.label.toLowerCase()}.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
              ← Back
            </Button>
          ) : (
            <div />
          )}
          {step < 5 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canContinue} className="px-6 py-3">
              Continue →
            </Button>
          ) : (
            <Button type="button" onClick={() => void submit()} disabled={submitting} className="px-6 py-3">
              {submitting ? copy.review.busy : copy.review.cta}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
