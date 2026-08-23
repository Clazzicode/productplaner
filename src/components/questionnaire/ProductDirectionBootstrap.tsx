"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { LEGACY_QUALIFYING_PROFILE_DEFAULTS } from "@/lib/questionnaire/legacyQualifyingDefaults";
import { depthFromExperience, guidanceFor } from "@/lib/questionnaire/roleGuidance";
import type { WorkingRole } from "@/lib/onboarding/types";
import SectionProgress from "./SectionProgress";
import GuidanceBanner from "./GuidanceBanner";
import ProductDirectionFields, { type ProductDirectionValues } from "./ProductDirectionFields";

const EXPERIENCE_OPTIONS = [
  { value: "first_time", label: "This is my first formal plan" },
  { value: "some_experience", label: "Some experience" },
  { value: "experienced", label: "Experienced" },
  { value: "expert", label: "Expert — I could teach this" },
];

export default function ProductDirectionBootstrap(props: { hasProfile: boolean; workingRole: WorkingRole | null }) {
  const router = useRouter();
  const [gate, setGate] = useState<"software_product" | "non_product" | null>(
    props.hasProfile ? "software_product" : null,
  );
  const [experienceLevel, setExperienceLevel] = useState("some_experience");
  const [values, setValues] = useState<ProductDirectionValues>({
    name: "",
    description: "",
    problemStatement: "",
    targetCustomer: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verbose = depthFromExperience(props.hasProfile ? undefined : experienceLevel);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (!props.hasProfile) {
      const profileRes = await apiFetch("/api/qualifying", {
        method: "POST",
        body: { ...LEGACY_QUALIFYING_PROFILE_DEFAULTS, productType: "software_product", experienceLevel },
      });
      if (!profileRes.ok) {
        setSubmitting(false);
        setError(profileRes.error ?? "Could not save your setup.");
        return;
      }
    }

    const initRes = await apiFetch<{ initiativeId: string }>("/api/initiatives", {
      method: "POST",
      body: { name: values.name, description: values.description },
    });
    if (!initRes.ok || !initRes.data) {
      setSubmitting(false);
      setError(initRes.error ?? "Could not create the initiative.");
      return;
    }

    const { initiativeId } = initRes.data;
    await apiFetch(`/api/initiatives/${initiativeId}/intake`, {
      method: "PATCH",
      body: { problemStatement: values.problemStatement, targetCustomer: values.targetCustomer },
    });

    setSubmitting(false);
    router.push(`/initiatives/${initiativeId}/intake`);
    router.refresh();
  };

  return (
    <div>
      <SectionProgress current={0} />
      <GuidanceBanner section="productDirection" workingRole={props.workingRole} />

      <form onSubmit={submit} className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        {!props.hasProfile && gate !== "software_product" && (
          <div>
            <h2 className="text-xl font-semibold">What are you planning?</h2>
            <p className="mt-1 mb-5 text-sm text-neutral-500">
              This platform plans software products only — it'll say so honestly if it's not the
              right tool for what you have in mind.
            </p>
            {gate === "non_product" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
                <h3 className="font-semibold text-amber-900">This probably isn&apos;t the right tool for that</h3>
                <p className="mt-3 text-sm text-amber-800">
                  The Guided Product Planning Platform plans <strong>software products</strong> only.
                  Marketing campaigns, office projects, and client services deserve a tool built for
                  them — a work-management or campaign-planning product will serve you far better.
                </p>
                <button
                  type="button"
                  onClick={() => setGate(null)}
                  className="mt-4 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
                >
                  ← Go back — I&apos;m planning a software product
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setGate("software_product")}
                  className="rounded-xl border border-neutral-200 bg-white p-4 text-left hover:border-indigo-400 hover:bg-indigo-50"
                >
                  <p className="font-medium">Software Product</p>
                  <p className="mt-1 text-xs text-neutral-500">App, platform, SaaS, API, internal tool…</p>
                </button>
                <button
                  type="button"
                  onClick={() => setGate("non_product")}
                  className="rounded-xl border border-neutral-200 bg-white p-4 text-left hover:border-indigo-400 hover:bg-indigo-50"
                >
                  <p className="font-medium">Something else</p>
                  <p className="mt-1 text-xs text-neutral-500">Marketing campaign, office project, client services…</p>
                </button>
              </div>
            )}
          </div>
        )}

        {(props.hasProfile || gate === "software_product") && (
          <>
            {!props.hasProfile && (
              <label className="mb-6 block text-sm font-medium">
                How much product planning experience do you have?
                <p className="mt-1 mb-1.5 text-xs text-neutral-500">
                  Calibrates how much explanation you see throughout — not what's asked.
                </p>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  {EXPERIENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <ProductDirectionFields
              values={values}
              onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
              verbose={verbose}
            />

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <div className="mt-7 flex justify-end">
              <button
                type="submit"
                disabled={submitting || values.name.trim().length < 3}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Continue →"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
