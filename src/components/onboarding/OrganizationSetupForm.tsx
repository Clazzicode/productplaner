"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readOnboardingState, writeOnboardingState } from "@/lib/onboarding/tempStateClient";
import WorkspaceTypeStep from "./WorkspaceTypeStep";

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"];

export default function OrganizationSetupForm() {
  const router = useRouter();
  const [workspaceType, setWorkspaceType] = useState<"solo" | "team" | null>(null);
  const [name, setName] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [industry, setIndustry] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Prefill from temporary state only (back-nav / refresh). No database read —
  // organization name is not persisted in this phase. See docs/V2-ONBOARDING.md.
  useEffect(() => {
    const state = readOnboardingState();
    if (state.workspaceType) setWorkspaceType(state.workspaceType);
    if (state.organizationName) setName(state.organizationName);
    if (state.companySize) setCompanySize(state.companySize);
    if (state.industry) setIndustry(state.industry);
  }, []);

  const pickWorkspaceType = (value: "solo" | "team") => {
    writeOnboardingState({ workspaceType: value });
    if (value === "solo") {
      // A solo workspace already exists from signup — nothing else to collect.
      router.push("/onboarding/role");
      return;
    }
    setWorkspaceType("team");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Give your organization a name (2+ characters).");
      return;
    }
    setError(null);
    writeOnboardingState({ workspaceType: "team", organizationName: trimmed, companySize, industry });
    router.push("/onboarding/role");
  };

  if (workspaceType === null) {
    return <WorkspaceTypeStep onPick={pickWorkspaceType} />;
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm"
    >
      <button
        type="button"
        onClick={() => setWorkspaceType(null)}
        className="mb-5 text-sm text-neutral-500 hover:text-neutral-800"
      >
        ← Change (Solo / Team)
      </button>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Organization name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Inc."
          className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>

      <label className="mt-5 block">
        <span className="text-sm font-medium text-neutral-700">
          Company size <span className="text-neutral-400">(optional)</span>
        </span>
        <select
          value={companySize}
          onChange={(e) => setCompanySize(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Prefer not to say</option>
          {COMPANY_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} employees
            </option>
          ))}
        </select>
      </label>

      <label className="mt-5 block">
        <span className="text-sm font-medium text-neutral-700">
          Industry <span className="text-neutral-400">(optional)</span>
        </span>
        <input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. Fintech, Healthcare, Retail"
          className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-7 flex justify-end">
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Continue
        </button>
      </div>
    </form>
  );
}
