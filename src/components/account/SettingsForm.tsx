"use client";

import { useState } from "react";
import { ChoiceCard } from "@/components/questionnaire/Choice";
import { ButtonLoader } from "@/components/ui/loading";
import { apiFetch } from "@/lib/clientApi";
import { EXPERIENCE_LEVEL_OPTIONS, type SelectableExperienceLevel } from "@/lib/onboarding/experienceOptions";
import { WORKING_ROLE_META, WORKING_ROLE_ORDER } from "@/lib/onboarding/roleOptions";
import type { WorkingRole } from "@/lib/onboarding/types";

/** Two independent cards, each its own selection state and its own Save —
 * they hit two unrelated endpoints with independent failure modes, so a
 * failure saving one shouldn't block or mask the other's success. */
export default function SettingsForm(props: {
  currentExperienceLevel: SelectableExperienceLevel;
  currentWorkingRole: WorkingRole | null;
}) {
  return (
    <div className="mt-8 space-y-6">
      <ExperienceLevelCard initial={props.currentExperienceLevel} />
      <WorkingRoleCard initial={props.currentWorkingRole} />
    </div>
  );
}

function ExperienceLevelCard(props: { initial: SelectableExperienceLevel }) {
  const [selected, setSelected] = useState<SelectableExperienceLevel>(props.initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await apiFetch("/api/qualifying", { method: "PATCH", body: { experienceLevel: selected } });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save.");
      return;
    }
    setSaved(true);
  };

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-text-primary">Experience level</h2>
      <p className="mt-1 text-xs text-text-secondary">
        Calibrates how much explanation you see throughout — not what&apos;s asked.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {EXPERIENCE_LEVEL_OPTIONS.map((o) => (
          <ChoiceCard
            key={o.value}
            selected={selected === o.value}
            onClick={() => {
              setSelected(o.value);
              setSaved(false);
            }}
            label={o.label}
            hint={o.hint}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <ButtonLoader
          onClick={() => void save()}
          loading={saving}
          loadingLabel="Saving"
          disabled={selected === props.initial}
          variant="secondary"
        >
          Save
        </ButtonLoader>
        {saved && <span className="text-xs font-medium text-emerald-700">Saved</span>}
        {error && <span className="text-xs font-medium text-red-600">{error}</span>}
      </div>
    </section>
  );
}

function WorkingRoleCard(props: { initial: WorkingRole | null }) {
  const [selected, setSelected] = useState<WorkingRole | null>(props.initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await apiFetch("/api/account/working-role", { method: "PATCH", body: { workingRole: selected } });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save.");
      return;
    }
    setSaved(true);
  };

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-text-primary">Working role</h2>
      <p className="mt-1 text-xs text-text-secondary">
        Shapes how guidance is framed throughout — not what&apos;s asked or how your plan is built.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {WORKING_ROLE_ORDER.map((value) => {
          const meta = WORKING_ROLE_META[value];
          return (
            <ChoiceCard
              key={value}
              selected={selected === value}
              onClick={() => {
                setSelected(value);
                setSaved(false);
              }}
              label={meta.label}
              hint={meta.description}
            />
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <ButtonLoader
          onClick={() => void save()}
          loading={saving}
          loadingLabel="Saving"
          disabled={selected === props.initial}
          variant="secondary"
        >
          Save
        </ButtonLoader>
        {saved && <span className="text-xs font-medium text-emerald-700">Saved</span>}
        {error && <span className="text-xs font-medium text-red-600">{error}</span>}
      </div>
    </section>
  );
}
