"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { LEGACY_QUALIFYING_PROFILE_DEFAULTS } from "@/lib/questionnaire/legacyQualifyingDefaults";
import { readOnboardingState } from "@/lib/onboarding/tempStateClient";
import { EXPERIENCE_LEVEL_OPTIONS } from "@/lib/onboarding/experienceOptions";
import Button from "@/components/ui/Button";
import { ChoiceCard } from "@/components/questionnaire/Choice";
import { ButtonLoader } from "@/components/ui/loading";

/**
 * Guided-activation restructure (reference doc §2/§3): pure Experience
 * Calibration — the second onboarding step, right after Workspace Setup and
 * ahead of Role/Working Context. Previously this component also asked the
 * Working Role question (with a "Something else" reject flow) when a user
 * reached /welcome without a role already set; that's gone now that Role is
 * always a separate, later step (/onboarding/role) in the fixed sequence —
 * nothing reaches this page without Workspace Setup already routing here
 * first, per OrganizationSetupForm.
 *
 * Submitting creates the QualifyingProfile (marking Experience Calibration
 * complete for RootPage's resume logic) and moves on to Role, not /home.
 */
export default function WelcomeQualifying() {
  const router = useRouter();
  const [experienceLevel, setExperienceLevel] = useState("some_experience");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const workspaceType = readOnboardingState().workspaceType;
    const res = await apiFetch("/api/qualifying", {
      method: "POST",
      body: {
        ...LEGACY_QUALIFYING_PROFILE_DEFAULTS,
        teamComposition: workspaceType === "solo" ? "solo" : "small_team",
        productType: "software_product",
        experienceLevel,
      },
    });
    if (!res.ok) {
      setSubmitting(false);
      setError(res.error ?? "Something went wrong.");
      return;
    }
    router.push("/onboarding/role");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-md md:p-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Question 1</p>
        <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-primary">
          How much product planning experience do you have?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          Calibrates how much explanation you see throughout — not what&apos;s asked.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {EXPERIENCE_LEVEL_OPTIONS.map((o) => (
            <ChoiceCard
              key={o.value}
              selected={experienceLevel === o.value}
              onClick={() => setExperienceLevel(o.value)}
              label={o.label}
              hint={o.hint}
            />
          ))}
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-8 flex items-center justify-between">
          <Button type="button" variant="ghost" onClick={() => router.push("/onboarding")}>
            ← Back
          </Button>
          <ButtonLoader
            type="button"
            onClick={submit}
            loading={submitting}
            loadingLabel="Saving"
            className="px-6 py-3"
          >
            Continue →
          </ButtonLoader>
        </div>
      </div>
    </div>
  );
}
