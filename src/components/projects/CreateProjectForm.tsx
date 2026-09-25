"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { ButtonLoader, GenerationProgress } from "@/components/ui/loading";

const FIELD_CLASS =
  "rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

// Directive item 10: a meaningful checklist, not a generic spinner — but
// honest about it. Project creation is genuinely one network request today
// (no separate backend "permissions" phase exists to report on — org
// membership/permissions already exist from signup), so this is two real
// steps, not padded to match a longer illustrative example.
// GenerationProgress's own contract (src/components/ui/loading/GenerationProgress.tsx)
// is explicit: every step shown as done must have really happened, never a
// timer — `step` only ever advances from a real await boundary below.
const PROJECT_CREATION_STEPS = ["Creating your project", "Opening your project home"];

/**
 * A brand-new Project starts a clean context (directive §6) — nothing here
 * is pre-filled from another Project. Every field is optional except name:
 * shared context can always be filled in later from Project Home.
 */
export default function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("");
  const [averageHourlyRate, setAverageHourlyRate] = useState("");
  const [targetLaunchDate, setTargetLaunchDate] = useState("");
  const [planningApproach, setPlanningApproach] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStep(0);
    setError(null);
    const res = await apiFetch<{ projectId: string }>("/api/projects", {
      method: "POST",
      body: {
        name,
        description,
        goal,
        budget: budget === "" ? null : Number(budget),
        ...(averageHourlyRate === "" ? {} : { averageHourlyRate: Number(averageHourlyRate) }),
        targetLaunchDate: targetLaunchDate || null,
        planningApproach,
      },
    });
    if (!res.ok || !res.data) {
      setBusy(false);
      setError(res.error ?? "Could not create the project.");
      return;
    }
    // Deliberately not resetting `busy` on the success path — it stays true
    // (showing step 1) through the real interval until the route change
    // unmounts this component, matching SimplifiedIntakeWizard.tsx's own
    // precedent for the same GenerationProgress component.
    setStep(1);
    router.push(`/projects/${res.data.projectId}`);
    router.refresh();
  };

  if (busy) {
    return <GenerationProgress title="Creating your project" steps={PROJECT_CREATION_STEPS} currentStep={step} />;
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-md">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 sm:col-span-2">
          Project name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Customer Onboarding Revamp"
            className={FIELD_CLASS}
            required
            minLength={3}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 sm:col-span-2">
          Description <span className="font-normal text-neutral-400">(optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${FIELD_CLASS} min-h-20`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 sm:col-span-2">
          Goal <span className="font-normal text-neutral-400">(optional)</span>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Budget ($, optional)
          <input
            type="number"
            min={0}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Avg. hourly rate ($, optional)
          <input
            type="number"
            min={1}
            value={averageHourlyRate}
            onChange={(e) => setAverageHourlyRate(e.target.value)}
            placeholder="85"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Target / projected go-live <span className="font-normal text-neutral-400">(optional)</span>
          <input
            type="date"
            value={targetLaunchDate}
            onChange={(e) => setTargetLaunchDate(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 sm:col-span-2">
          Planning approach <span className="font-normal text-neutral-400">(optional)</span>
          <input
            value={planningApproach}
            onChange={(e) => setPlanningApproach(e.target.value)}
            placeholder="e.g. Hybrid waterfall, agile scrum"
            className={FIELD_CLASS}
          />
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex justify-end">
        <ButtonLoader
          type="submit"
          loading={false}
          disabled={name.trim().length < 3}
          className="px-6 py-3"
        >
          Create Project
        </ButtonLoader>
      </div>
    </form>
  );
}
