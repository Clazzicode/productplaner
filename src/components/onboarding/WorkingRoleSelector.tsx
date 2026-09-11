"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";
import { readOnboardingState, writeOnboardingState } from "@/lib/onboarding/tempStateClient";
import { WORKING_ROLE_META } from "@/lib/onboarding/roleOptions";
import type { WorkingRole } from "@/lib/onboarding/types";

const ROLE_ORDER: WorkingRole[] = ["product_management", "project_manager", "product_owner"];

export default function WorkingRoleSelector() {
  const router = useRouter();
  const [selected, setSelected] = useState<WorkingRole | null>(null);

  useEffect(() => {
    const state = readOnboardingState();
    if (state.workingRole) setSelected(state.workingRole);
  }, []);

  const pick = (value: WorkingRole) => {
    setSelected(value);
    // Persist on selection, not just on Continue, so a refresh before Continue
    // doesn't lose the choice.
    writeOnboardingState({ workingRole: value });
  };

  const submit = () => {
    if (!selected) return;
    writeOnboardingState({ workingRole: selected, complete: true });
    // Step 8B: persist onto the real User row, not just the cookie. Fire and
    // forget — the cookie remains the source of truth for this navigation, and
    // a failed write here just means the dashboard falls back to the cookie
    // until the next successful save (see docs/V2-USERS-TEAMS.md "Working
    // Role Cookie Transition").
    void apiFetch("/api/account/working-role", { method: "PATCH", body: { workingRole: selected } });
    router.push("/welcome");
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
          onClick={() => router.push("/onboarding")}
          className="text-sm text-neutral-500 hover:text-neutral-800"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!selected}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
