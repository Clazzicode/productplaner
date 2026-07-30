"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/clientApi";

export interface CapabilityView {
  id: string;
  name: string;
  description: string;
  isMvp: boolean;
  effortSize: string;
  businessValue: string;
  dependsOn: string[];
}

export interface IntakeView {
  problemStatement: string;
  targetCustomer: string;
  outcomeStatement: string;
  outcomeMetric: string;
  teamSize: number | null;
  sprintLengthWeeks: number;
  velocityPerPersonPerSprint: number;
  capacityBufferPercent: number;
}

interface Flag {
  code: string;
  message: string;
}

const EFFORT_OPTIONS = [
  { value: "xs", label: "XS — a few days" },
  { value: "s", label: "S — about a week" },
  { value: "m", label: "M — a couple of weeks" },
  { value: "l", label: "L — most of a month" },
  { value: "xl", label: "XL — more than a month" },
];

const VALUE_OPTIONS = [
  { value: "low", label: "Low — nice to have" },
  { value: "medium", label: "Medium — clearly useful" },
  { value: "high", label: "High — moves the outcome" },
  { value: "critical", label: "Critical — the product fails without it" },
];

const STEPS = ["Problem", "Customer", "Outcome", "Capabilities", "Capacity", "Review"] as const;

export default function IntakeWizard(props: {
  initiativeId: string;
  initiativeName: string;
  intake: IntakeView;
  capabilities: CapabilityView[];
  verbose: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [intake, setIntake] = useState<IntakeView>(props.intake);
  const [caps, setCaps] = useState<CapabilityView[]>(props.capabilities);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<{ errors: Flag[]; warnings: Flag[] } | null>(null);

  const { initiativeId, verbose } = props;

  const saveIntake = async (fields: Partial<IntakeView>): Promise<boolean> => {
    const res = await apiFetch(`/api/initiatives/${initiativeId}/intake`, {
      method: "PATCH",
      body: fields,
    });
    if (!res.ok) setError(res.error ?? "Could not save.");
    return res.ok;
  };

  const advance = async (fields?: Partial<IntakeView>) => {
    setError(null);
    setBusy(true);
    const ok = fields ? await saveIntake(fields) : true;
    setBusy(false);
    if (ok) setStep((s) => s + 1);
  };

  const refreshValidation = useCallback(async () => {
    const res = await apiFetch<{ errors: Flag[]; warnings: Flag[] }>(
      `/api/initiatives/${initiativeId}/validate`,
    );
    if (res.ok && res.data) setValidation(res.data);
  }, [initiativeId]);

  useEffect(() => {
    if (step === STEPS.length - 1) void refreshValidation();
  }, [step, refreshValidation]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/initiatives/${initiativeId}/generate`, {
      method: "POST",
      body: {},
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Generation failed.");
      void refreshValidation();
      return;
    }
    router.push(`/initiatives/${initiativeId}/workspace/roadmap`);
    router.refresh();
  };

  return (
    <div>
      {/* Progress */}
      <ol className="mb-8 flex flex-wrap gap-1 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-1">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`rounded-full px-3 py-1 font-medium ${
                i === step
                  ? "bg-indigo-600 text-white"
                  : i < step
                    ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                    : "bg-neutral-100 text-neutral-400"
              }`}
            >
              {i + 1}. {label}
            </button>
            {i < STEPS.length - 1 && <span className="text-neutral-300">→</span>}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <QuestionCard
          number={1}
          title="What problem are you solving?"
          help={
            verbose
              ? "Describe the pain in the customer's world — not your solution. This answer anchors the whole plan: it frames the roadmap, feeds every epic description, and opens the executive narrative. Example: “Support agents juggle five disconnected tools to answer one billing question, so responses take days and customers churn.”"
              : "The anchor for the whole chain — roadmap framing, epic descriptions, executive narrative."
          }
        >
          <textarea
            value={intake.problemStatement}
            onChange={(e) => setIntake({ ...intake, problemStatement: e.target.value })}
            rows={4}
            placeholder="The problem, in plain language…"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 focus:border-indigo-500 focus:outline-none"
          />
          <WizardNav
            busy={busy}
            onNext={() => advance({ problemStatement: intake.problemStatement })}
          />
        </QuestionCard>
      )}

      {step === 1 && (
        <QuestionCard
          number={2}
          title="Who is the target customer?"
          help={
            verbose
              ? "Name the person, not the market. Every user story will be written from this persona's point of view, and acceptance criteria test against their reality. Example: “billing support agents at mid-market SaaS companies.”"
              : "Drives user story personas and acceptance criteria context."
          }
        >
          <textarea
            value={intake.targetCustomer}
            onChange={(e) => setIntake({ ...intake, targetCustomer: e.target.value })}
            rows={2}
            placeholder="e.g. billing support agents at mid-market SaaS companies"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 focus:border-indigo-500 focus:outline-none"
          />
          <WizardNav
            busy={busy}
            onBack={() => setStep(0)}
            onNext={() => advance({ targetCustomer: intake.targetCustomer })}
          />
        </QuestionCard>
      )}

      {step === 2 && (
        <QuestionCard
          number={3}
          title="What outcome are you trying to achieve?"
          help={
            verbose
              ? "The measurable goal the roadmap and release plan are sequenced against. State the change you want in the world, then (ideally) how you'd measure it. Example: outcome “agents resolve billing questions in one sitting”, metric “median resolution time under 10 minutes.”"
              : "Becomes the measurable goal the roadmap and release plan are sequenced against."
          }
        >
          <textarea
            value={intake.outcomeStatement}
            onChange={(e) => setIntake({ ...intake, outcomeStatement: e.target.value })}
            rows={3}
            placeholder="The outcome you want…"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 focus:border-indigo-500 focus:outline-none"
          />
          <label className="mt-4 block text-sm font-medium">
            How will you measure it? <span className="font-normal text-neutral-400">(optional but recommended)</span>
            <input
              value={intake.outcomeMetric}
              onChange={(e) => setIntake({ ...intake, outcomeMetric: e.target.value })}
              placeholder="e.g. median resolution time under 10 minutes"
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2.5 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <WizardNav
            busy={busy}
            onBack={() => setStep(1)}
            onNext={() =>
              advance({
                outcomeStatement: intake.outcomeStatement,
                outcomeMetric: intake.outcomeMetric,
              })
            }
          />
        </QuestionCard>
      )}

      {step === 3 && (
        <CapabilitiesStep
          initiativeId={initiativeId}
          caps={caps}
          setCaps={setCaps}
          verbose={verbose}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <QuestionCard
          number={7}
          title="What is the team's available capacity?"
          help={
            verbose
              ? "This one answer powers both halves of the hybrid model: it sets the waterfall phase timeline AND the sprint-by-sprint plan. Velocity is how many story points one person typically completes per sprint — 8 is a sensible default if you don't track it. The buffer covers meetings, support, and the unexpected."
              : "Mapped to both waterfall phases and sprint cadence — the dual mapping that powers the hybrid model."
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Team size (people)"
              value={intake.teamSize ?? ""}
              min={1}
              max={200}
              onChange={(v) => setIntake({ ...intake, teamSize: v })}
            />
            <NumberField
              label="Sprint length (weeks)"
              value={intake.sprintLengthWeeks}
              min={1}
              max={4}
              onChange={(v) => setIntake({ ...intake, sprintLengthWeeks: v ?? 2 })}
            />
            <NumberField
              label="Velocity (points / person / sprint)"
              value={intake.velocityPerPersonPerSprint}
              min={1}
              max={40}
              onChange={(v) => setIntake({ ...intake, velocityPerPersonPerSprint: v ?? 8 })}
            />
            <NumberField
              label="Capacity buffer (%)"
              value={intake.capacityBufferPercent}
              min={0}
              max={90}
              onChange={(v) => setIntake({ ...intake, capacityBufferPercent: v ?? 20 })}
            />
          </div>
          {intake.teamSize && intake.teamSize > 0 && (
            <p className="mt-4 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
              Effective sprint capacity:{" "}
              <strong>
                {(
                  intake.teamSize *
                  intake.velocityPerPersonPerSprint *
                  (1 - intake.capacityBufferPercent / 100)
                ).toFixed(1)}{" "}
                points
              </strong>{" "}
              per {intake.sprintLengthWeeks}-week sprint.
            </p>
          )}
          <WizardNav
            busy={busy}
            onBack={() => setStep(3)}
            onNext={() =>
              advance({
                teamSize: intake.teamSize,
                sprintLengthWeeks: intake.sprintLengthWeeks,
                velocityPerPersonPerSprint: intake.velocityPerPersonPerSprint,
                capacityBufferPercent: intake.capacityBufferPercent,
              })
            }
          />
        </QuestionCard>
      )}

      {step === 5 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold">Review &amp; generate</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Your answers are validated before generation (FR-05). Flags below must be resolved
            — generation stays disabled while hard errors remain.
          </p>

          {validation === null ? (
            <p className="mt-6 text-sm text-neutral-500">Checking your answers…</p>
          ) : (
            <div className="mt-6 space-y-3">
              {validation.errors.length === 0 && validation.warnings.length === 0 && (
                <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Everything checks out. Ready to generate.
                </p>
              )}
              {validation.errors.map((f, i) => (
                <p key={`e${i}`} className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
                  <strong>Fix required:</strong> {f.message}
                </p>
              ))}
              {validation.warnings.map((f, i) => (
                <p key={`w${i}`} className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <strong>Heads-up:</strong> {f.message}
                </p>
              ))}
            </div>
          )}

          <div className="mt-6 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-600">
            <p className="font-medium text-neutral-800">What happens next</p>
            <p className="mt-1">
              The engine generates your working prototype in hybrid waterfall sequence: Roadmap
              → Feature Hierarchy → Epics → User Stories → Acceptance Criteria, with the Sprint
              Plan, Release Plan and Capacity Forecast computed beneath. Every artifact stays
              traceable to the answer that produced it. Intake answers become permanent.
            </p>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <div className="mt-6 flex items-center justify-between">
            <button onClick={() => setStep(4)} className="text-sm text-neutral-500 hover:text-neutral-800">
              ← Back
            </button>
            <button
              onClick={generate}
              disabled={busy || !validation || validation.errors.length > 0}
              className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Generating your prototype…" : "Generate working prototype"}
            </button>
          </div>
        </div>
      )}

      {error && step !== 5 && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ---------- capabilities step (Q4/Q5/Q6/Q8 per capability) ----------

function CapabilitiesStep(props: {
  initiativeId: string;
  caps: CapabilityView[];
  setCaps: React.Dispatch<React.SetStateAction<CapabilityView[]>>;
  verbose: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const { initiativeId, caps, setCaps, verbose, onBack, onNext } = props;
  const [editing, setEditing] = useState<CapabilityView | null>(null);
  const [adding, setAdding] = useState(caps.length === 0);
  const [error, setError] = useState<string | null>(null);

  const remove = async (id: string) => {
    const res = await apiFetch(`/api/capabilities/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(res.error ?? "Could not delete.");
      return;
    }
    setCaps((c) => c.filter((x) => x.id !== id));
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
        Questions 4, 5, 6 &amp; 8 — answered per capability
      </p>
      <h2 className="mt-1 text-xl font-semibold">What does the product need to do?</h2>
      <p className="mt-1 text-sm text-neutral-500">
        {verbose
          ? "List each capability (a feature or ability the product needs). For each one you'll say whether the MVP needs it (Q4), what it depends on (Q5), how much effort it takes (Q6), and the business value it delivers (Q8). Each capability becomes a branch of the plan: feature → epics → stories."
          : "Each capability carries its own MVP flag (Q4), dependencies (Q5), effort (Q6), and business value (Q8)."}
      </p>

      <ul className="mt-6 space-y-2">
        {caps.map((cap) => (
          <li
            key={cap.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3"
          >
            <div>
              <p className="font-medium">
                {cap.name}{" "}
                {cap.isMvp && (
                  <span className="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                    MVP
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Effort {cap.effortSize.toUpperCase()} · Value {cap.businessValue}
                {cap.dependsOn.length > 0 &&
                  ` · depends on ${cap.dependsOn
                    .map((d) => caps.find((c) => c.id === d)?.name ?? "?")
                    .join(", ")}`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2 text-xs">
              <button
                onClick={() => {
                  setEditing(cap);
                  setAdding(false);
                }}
                className="text-indigo-600 hover:underline"
              >
                Edit
              </button>
              <button onClick={() => remove(cap.id)} className="text-red-500 hover:underline">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {(adding || editing) && (
        <CapabilityForm
          key={editing?.id ?? "new"}
          initiativeId={initiativeId}
          existing={editing}
          others={caps.filter((c) => c.id !== editing?.id)}
          onSaved={(saved) => {
            setCaps((c) =>
              editing ? c.map((x) => (x.id === saved.id ? saved : x)) : [...c, saved],
            );
            setEditing(null);
            setAdding(false);
          }}
          onCancel={() => {
            setEditing(null);
            setAdding(false);
          }}
        />
      )}

      {!adding && !editing && (
        <button
          onClick={() => setAdding(true)}
          className="mt-4 rounded-lg border border-dashed border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
        >
          + Add a capability
        </button>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-8 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-neutral-500 hover:text-neutral-800">
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={caps.length === 0}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

function CapabilityForm(props: {
  initiativeId: string;
  existing: CapabilityView | null;
  others: CapabilityView[];
  onSaved: (cap: CapabilityView) => void;
  onCancel: () => void;
}) {
  const { initiativeId, existing, others, onSaved, onCancel } = props;
  const [form, setForm] = useState<Omit<CapabilityView, "id">>({
    name: existing?.name ?? "",
    description: existing?.description ?? "",
    isMvp: existing?.isMvp ?? true,
    effortSize: existing?.effortSize ?? "m",
    businessValue: existing?.businessValue ?? "high",
    dependsOn: existing?.dependsOn ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = existing
      ? await apiFetch(`/api/capabilities/${existing.id}`, { method: "PATCH", body: form })
      : await apiFetch<{ capabilityId: string }>(`/api/initiatives/${initiativeId}/capabilities`, {
          method: "POST",
          body: form,
        });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save.");
      return;
    }
    const id = existing?.id ?? (res.data as { capabilityId: string }).capabilityId;
    onSaved({ id, ...form });
  };

  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
      <label className="block text-sm font-medium">
        Capability name
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Bulk CSV import"
          className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none"
          autoFocus
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        What it does <span className="font-normal text-neutral-400">(optional)</span>
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="One sentence"
          className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none"
        />
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium">Q4 — Required for the MVP?</p>
          <div className="mt-1 flex gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                onClick={() => setForm({ ...form, isMvp: v })}
                className={`rounded-lg border px-4 py-1.5 text-sm ${
                  form.isMvp === v
                    ? "border-indigo-500 bg-indigo-100 font-semibold text-indigo-800"
                    : "border-neutral-300 bg-white"
                }`}
              >
                {v ? "Yes — MVP" : "No — later"}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-sm font-medium">
          Q6 — Level of effort
          <select
            value={form.effortSize}
            onChange={(e) => setForm({ ...form, effortSize: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none"
          >
            {EFFORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Q8 — Business value
          <select
            value={form.businessValue}
            onChange={(e) => setForm({ ...form, businessValue: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none"
          >
            {VALUE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <p className="text-sm font-medium">Q5 — Depends on</p>
          {others.length === 0 ? (
            <p className="mt-1 text-xs text-neutral-500">
              No other capabilities yet — dependencies can be added once there are more.
            </p>
          ) : (
            <div className="mt-1 space-y-1">
              {others.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.dependsOn.includes(o.id)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        dependsOn: e.target.checked
                          ? [...form.dependsOn, o.id]
                          : form.dependsOn.filter((d) => d !== o.id),
                      })
                    }
                  />
                  {o.name}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex justify-end gap-3">
        <button onClick={onCancel} className="text-sm text-neutral-500 hover:text-neutral-800">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy || form.name.trim().length < 3}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? "Saving…" : existing ? "Save changes" : "Add capability"}
        </button>
      </div>
    </div>
  );
}

// ---------- small shared pieces ----------

function QuestionCard(props: {
  number: number;
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
        Question {props.number} of 8
      </p>
      <h2 className="mt-1 text-xl font-semibold">{props.title}</h2>
      <p className="mt-2 mb-5 text-sm text-neutral-500">{props.help}</p>
      {props.children}
    </div>
  );
}

function WizardNav(props: { busy: boolean; onBack?: () => void; onNext: () => void }) {
  return (
    <div className="mt-6 flex items-center justify-between">
      {props.onBack ? (
        <button onClick={props.onBack} className="text-sm text-neutral-500 hover:text-neutral-800">
          ← Back
        </button>
      ) : (
        <span />
      )}
      <button
        onClick={props.onNext}
        disabled={props.busy}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {props.busy ? "Saving…" : "Continue →"}
      </button>
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number | "";
  min: number;
  max: number;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      {props.label}
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        onChange={(e) => props.onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
      />
    </label>
  );
}
