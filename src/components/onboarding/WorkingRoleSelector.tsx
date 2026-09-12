"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";
import { writeOnboardingState } from "@/lib/onboarding/tempStateClient";
import { useOnboardingStateSnapshot } from "@/lib/onboarding/useOnboardingStateSnapshot";
import { WORKING_ROLE_META } from "@/lib/onboarding/roleOptions";
import type { WorkingRole } from "@/lib/onboarding/types";
import { ButtonLoader } from "@/components/ui/loading";

const ROLE_ORDER: WorkingRole[] = ["product_management", "product_owner", "project_manager"];

/**
 * Guided-activation restructure (reference doc §2/§13): Role/Working Context
 * is now the third onboarding step, right after Experience Calibration —
 * previously second, straight after Workspace Setup. Continuing here moves
 * into the merged adaptive-questions/initiative-creation step (decision #1),
 * not back to /welcome. Expanded from 3 to the reference doc's full 6-option
 * list (§13) — see roleOptions.ts for the added Business Analyst /
 * Founder-Business Lead / Other entries; none of them reject the user the
 * way WelcomeQualifying's old "Something else" branch used to.
 */
export default function WorkingRoleSelector() {
  const router = useRouter();
  const snapshot = useOnboardingStateSnapshot();
  const [selectedOverride, setSelectedOverride] = useState<WorkingRole | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selected = selectedOverride ?? snapshot.workingRole ?? null;

  const pick = (value: WorkingRole) => {
    setSelectedOverride(value);
    // Persist on selection, not just on Continue, so a refresh before Continue
    // doesn't lose the choice.
    writeOnboardingState({ workingRole: value });
  };

  const submit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    writeOnboardingState({ workingRole: selected });
    // Step 8B: persist onto the real User row, not just the cookie. Awaited
    // (not fire-and-forget) so the next page's resolveWorkingRole() call sees
    // the persisted value immediately rather than racing the write.
    await apiFetch("/api/account/working-role", { method: "PATCH", body: { workingRole: selected } });
    router.push("/initiatives/new");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="grid gap-4 sm:grid-cols-3">
        {ROLE_ORDER.map((value) => {
          const meta = WORKING_ROLE_META[value];
          return (
            <button
              key={value}
              type="button"
              onClick={() => pick(value)}
              aria-pressed={selected === value}
              className={`rounded-2xl border p-5 text-left transition hover:border-indigo-400 hover:bg-indigo-50 ${
                selected === value
                  ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                  : "border-neutral-200 bg-white"
              }`}
            >
              <h3 className="font-semibold">{meta.label}</h3>
              <p className="mt-1 text-sm text-neutral-500">{meta.description}</p>
              <ul className="mt-4 space-y-1 text-xs text-neutral-500">
                {meta.focus.map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/welcome")}
          className="text-sm text-neutral-500 hover:text-neutral-800"
        >
          ← Back
        </button>
        <ButtonLoader
          type="button"
          onClick={submit}
          disabled={!selected}
          loading={submitting}
          loadingLabel="Saving"
          className="px-5 py-2.5"
        >
          Continue
        </ButtonLoader>
      </div>
    </div>
  );
}
