"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import type { WorkingRole } from "@/lib/onboarding/types";
import { isAdvancedScoringComplete } from "@/lib/questionnaire/capabilityScoring";
import { mapMethodologyAnswer, type MethodologyAnswer } from "@/lib/questionnaire/methodologyMapping";
import Button from "@/components/ui/Button";
import SectionProgress from "./SectionProgress";
import GuidanceBanner from "./GuidanceBanner";
import { ChoiceCard, ChoicePill } from "./Choice";
import { FIELD_CLASS } from "./fieldStyles";
import ProductDirectionFields, { type ProductDirectionValues } from "./ProductDirectionFields";
import ImportIntakePanel from "./ImportIntakePanel";

export interface CapabilityView {
  id: string;
  name: string;
  description: string;
  isMvp: boolean;
  effortSize: string;
  businessValue: string;
  riskLevel: string;
  mvpImportance: string | null;
  customerImpactScore: number | null;
  revenueImpactScore: number | null;
  strategicAlignmentScore: number | null;
  riskComplianceScore: number | null;
  dependsOn: string[];
}

export interface SuccessValues {
  outcomeStatement: string;
  outcomeMetric: string;
  targetLaunchDate: string; // yyyy-mm-dd or ""
  budget: string; // numeric string or ""
}

export interface DeliveryValues {
  teamSize: number | "";
  sprintLengthWeeks: number;
  hoursPerSprintPerMember: number;
  utilizationRatePercent: number;
  capacityBufferPercent: number;
  hoursPerStoryPoint: number;
  historicalVelocityPoints: number | "";
  averageHourlyRate: string;
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
  { value: "very_low", label: "Very low — marginal" },
  { value: "low", label: "Low — nice to have" },
  { value: "medium", label: "Medium — clearly useful" },
  { value: "high", label: "High — moves the outcome" },
  { value: "critical", label: "Critical — the product fails without it" },
];
const RISK_OPTIONS = [
  { value: "low", label: "Low — well understood" },
  { value: "medium", label: "Medium — some unknowns" },
  { value: "high", label: "High — real technical or external uncertainty" },
  { value: "critical", label: "Critical — unproven technology or hard dependency" },
];
const MVP_IMPORTANCE_OPTIONS = [
  { value: "", label: "Auto (from MVP / Later)" },
  { value: "required_for_mvp", label: "Required for MVP" },
  { value: "strongly_preferred", label: "Strongly preferred" },
  { value: "useful_not_required", label: "Useful but not required" },
  { value: "future_enhancement", label: "Future enhancement" },
  { value: "optional", label: "Optional" },
];
const METHODOLOGY_OPTIONS: { value: MethodologyAnswer; label: string; hint: string }[] = [
  { value: "hybrid", label: "Hybrid", hint: "Structured planning, Agile delivery (recommended default)" },
  { value: "agile_scrum", label: "Agile / Scrum", hint: "Continuous prioritized backlog, no strict phase locking" },
  { value: "waterfall", label: "Waterfall", hint: "Strict sequential phases" },
  { value: "kanban", label: "Kanban", hint: "Continuous flow, no fixed sprints" },
  { value: "not_sure", label: "Not sure", hint: "We'll use Hybrid — our recommended default — until you change it" },
];
const EXECUTION_TOOL_OPTIONS = [
  { value: "jira", label: "Jira" },
  { value: "azure_devops", label: "Azure DevOps" },
  { value: "other", label: "Something else" },
  { value: "none", label: "Nothing yet" },
];

export default function PlanningQuestionnaire(props: {
  initiativeId: string;
  workingRole: WorkingRole | null;
  verbose: boolean;
  alreadyGenerated: boolean;
  initialStep: number;
  productDirection: ProductDirectionValues;
  success: SuccessValues;
  delivery: DeliveryValues;
  currentMethodology: string;
  capabilities: CapabilityView[];
}) {
  const router = useRouter();
  const { initiativeId, workingRole, verbose, alreadyGenerated } = props;

  const [step, setStep] = useState(props.initialStep);
  const [productDirection, setProductDirection] = useState(props.productDirection);
  const [success, setSuccess] = useState(props.success);
  const [caps, setCaps] = useState<CapabilityView[]>(props.capabilities);
  const [delivery, setDelivery] = useState(props.delivery);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [methodology, setMethodology] = useState<MethodologyAnswer>(
    (props.currentMethodology as MethodologyAnswer) || "hybrid",
  );
  const [executionTool, setExecutionTool] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<{ errors: Flag[]; warnings: Flag[] } | null>(null);

  const refreshValidation = useCallback(async () => {
    const res = await apiFetch<{ errors: Flag[]; warnings: Flag[] }>(`/api/initiatives/${initiativeId}/validate`);
    if (res.ok && res.data) setValidation(res.data);
  }, [initiativeId]);

  useEffect(() => {
    if (step === 5) void refreshValidation();
  }, [step, refreshValidation]);

  const jump = (i: number) => setStep(i);

  const saveProductDirection = async () => {
    const [a, b] = await Promise.all([
      apiFetch(`/api/initiatives/${initiativeId}`, {
        method: "PATCH",
        body: { name: productDirection.name },
      }),
      apiFetch(`/api/initiatives/${initiativeId}/intake`, {
        method: "PATCH",
        body: {
          problemStatement: productDirection.problemStatement,
          targetCustomer: productDirection.targetCustomer,
        },
      }),
    ]);
    return a.ok && b.ok;
  };

  const saveSuccess = async () => {
    const [a, b] = await Promise.all([
      apiFetch(`/api/initiatives/${initiativeId}/intake`, {
        method: "PATCH",
        body: { outcomeStatement: success.outcomeStatement, outcomeMetric: success.outcomeMetric },
      }),
      apiFetch(`/api/initiatives/${initiativeId}`, {
        method: "PATCH",
        body: {
          targetLaunchDate: success.targetLaunchDate || null,
          budget: success.budget === "" ? null : Number(success.budget),
        },
      }),
    ]);
    return a.ok && b.ok;
  };

  const saveDelivery = async () => {
    const [a, b] = await Promise.all([
      apiFetch(`/api/initiatives/${initiativeId}/intake`, {
        method: "PATCH",
        body: {
          teamSize: delivery.teamSize === "" ? null : delivery.teamSize,
          sprintLengthWeeks: delivery.sprintLengthWeeks,
          hoursPerSprintPerMember: delivery.hoursPerSprintPerMember,
          utilizationRatePercent: delivery.utilizationRatePercent,
          capacityBufferPercent: delivery.capacityBufferPercent,
          hoursPerStoryPoint: delivery.hoursPerStoryPoint,
          historicalVelocityPoints: delivery.historicalVelocityPoints === "" ? null : delivery.historicalVelocityPoints,
        },
      }),
      apiFetch(`/api/initiatives/${initiativeId}`, {
        method: "PATCH",
        body: {
          ...(delivery.averageHourlyRate === "" ? {} : { averageHourlyRate: Number(delivery.averageHourlyRate) }),
        },
      }),
    ]);
    return a.ok && b.ok;
  };

  const saveExecution = async () => {
    const mapped = mapMethodologyAnswer(methodology);
    // Guard: the methodology endpoint fully regenerates any existing plan on every call,
    // regardless of whether the value changed — only call it when it actually did.
    if (mapped === props.currentMethodology) return true;
    const res = await apiFetch(`/api/initiatives/${initiativeId}/methodology`, {
      method: "POST",
      body: { methodology: mapped },
    });
    return res.ok;
  };

  const advance = async (save: () => Promise<boolean>, next: number) => {
    setError(null);
    setBusy(true);
    const ok = await save();
    setBusy(false);
    if (!ok) {
      setError("Could not save this section — please try again.");
      return;
    }
    setStep(next);
  };

  const generate = async () => {
    if (alreadyGenerated) {
      router.push(`/initiatives/${initiativeId}/workspace/roadmap`);
      router.refresh();
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/initiatives/${initiativeId}/generate`, { method: "POST", body: {} });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Generation failed.");
      void refreshValidation();
      return;
    }
    router.push(`/initiatives/${initiativeId}/review`);
    router.refresh();
  };

  return (
    <div>
      <SectionProgress current={step} onJump={jump} />

      {step === 0 && (
        <Card>
          <GuidanceBanner section="productDirection" workingRole={workingRole} />
          <ImportIntakePanel
            initiativeId={initiativeId}
            productDirection={productDirection}
            success={success}
            onApplyProductDirection={(patch) => setProductDirection((v) => ({ ...v, ...patch }))}
            onApplySuccess={(patch) => setSuccess((s) => ({ ...s, ...patch }))}
            onCapabilityAdded={(cap) => setCaps((c) => [...c, cap])}
          />
          <ProductDirectionFields
            values={productDirection}
            onChange={(patch) => setProductDirection((v) => ({ ...v, ...patch }))}
            verbose={verbose}
          />
          <Nav busy={busy} onNext={() => advance(saveProductDirection, 1)} />
        </Card>
      )}

      {step === 1 && (
        <Card>
          <GuidanceBanner section="success" workingRole={workingRole} />
          <div className="space-y-5">
            <label className="block text-sm font-medium text-text-primary">
              Desired outcome
              <p className="mt-1 mb-1.5 text-xs text-text-muted">
                {verbose
                  ? "The measurable goal the roadmap and release plan are sequenced against."
                  : "Sequences the roadmap and release plan."}
              </p>
              <textarea
                value={success.outcomeStatement}
                onChange={(e) => setSuccess((s) => ({ ...s, outcomeStatement: e.target.value }))}
                rows={3}
                placeholder="The outcome you want…"
                className={`w-full ${FIELD_CLASS}`}
              />
            </label>
            <label className="block text-sm font-medium text-text-primary">
              How will you know this worked? <span className="font-normal text-text-muted">(optional but recommended)</span>
              <input
                value={success.outcomeMetric}
                onChange={(e) => setSuccess((s) => ({ ...s, outcomeMetric: e.target.value }))}
                placeholder="e.g. median resolution time under 10 minutes"
                className={`mt-1.5 w-full ${FIELD_CLASS}`}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-text-primary">
                Target launch date <span className="font-normal text-text-muted">(optional)</span>
                <input
                  type="date"
                  value={success.targetLaunchDate}
                  onChange={(e) => setSuccess((s) => ({ ...s, targetLaunchDate: e.target.value }))}
                  className={`mt-1.5 w-full ${FIELD_CLASS}`}
                />
              </label>
              <label className="block text-sm font-medium text-text-primary">
                Budget ($) <span className="font-normal text-text-muted">(optional)</span>
                <input
                  type="number"
                  min={0}
                  value={success.budget}
                  onChange={(e) => setSuccess((s) => ({ ...s, budget: e.target.value }))}
                  placeholder="e.g. 175000"
                  className={`mt-1.5 w-full ${FIELD_CLASS}`}
                />
              </label>
            </div>
          </div>
          <Nav busy={busy} onBack={() => setStep(0)} onNext={() => advance(saveSuccess, 2)} />
        </Card>
      )}

      {step === 2 && (
        <CapabilitiesSection
          initiativeId={initiativeId}
          caps={caps}
          setCaps={setCaps}
          workingRole={workingRole}
          verbose={verbose}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <Card>
          <GuidanceBanner section="delivery" workingRole={workingRole} />
          <NumberField
            label="How many people will actively contribute to delivery?"
            value={delivery.teamSize}
            min={1}
            max={200}
            onChange={(v) => setDelivery((d) => ({ ...d, teamSize: v ?? "" }))}
          />

          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="mt-6 text-sm font-semibold text-accent hover:text-accent-hover"
          >
            {advancedOpen ? "▾" : "▸"} Advanced planning assumptions
          </button>
          {advancedOpen && (
            <div className="mt-3 grid gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 sm:grid-cols-2">
              <NumberField label="Sprint length (weeks)" value={delivery.sprintLengthWeeks} min={1} max={4}
                onChange={(v) => setDelivery((d) => ({ ...d, sprintLengthWeeks: v ?? 2 }))} />
              <NumberField label="Hours per member per sprint" value={delivery.hoursPerSprintPerMember} min={1} max={400}
                onChange={(v) => setDelivery((d) => ({ ...d, hoursPerSprintPerMember: v ?? 80 }))} />
              <NumberField label="Utilization (%)" value={delivery.utilizationRatePercent} min={10} max={100}
                onChange={(v) => setDelivery((d) => ({ ...d, utilizationRatePercent: v ?? 70 }))} />
              <NumberField label="Capacity buffer (%)" value={delivery.capacityBufferPercent} min={0} max={90}
                onChange={(v) => setDelivery((d) => ({ ...d, capacityBufferPercent: v ?? 15 }))} />
              <NumberField label="Hours per story point" value={delivery.hoursPerStoryPoint} min={1} max={40}
                onChange={(v) => setDelivery((d) => ({ ...d, hoursPerStoryPoint: v ?? 8 }))} />
              <NumberField label="Historical velocity (points/sprint, optional)" value={delivery.historicalVelocityPoints} min={0} max={1000}
                onChange={(v) => setDelivery((d) => ({ ...d, historicalVelocityPoints: v ?? "" }))} />
              <label className="block text-sm font-medium text-text-primary">
                Average hourly rate ($)
                <input
                  type="number"
                  min={1}
                  value={delivery.averageHourlyRate}
                  onChange={(e) => setDelivery((d) => ({ ...d, averageHourlyRate: e.target.value }))}
                  className={`mt-1 w-full ${FIELD_CLASS}`}
                />
              </label>
            </div>
          )}

          <CapacityPreview delivery={delivery} />

          <Nav busy={busy} onBack={() => setStep(2)} onNext={() => advance(saveDelivery, 4)} />
        </Card>
      )}

      {step === 4 && (
        <Card>
          <GuidanceBanner section="execution" workingRole={workingRole} />
          <p className="mb-2.5 text-sm font-medium text-text-primary">Methodology</p>
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

          <p className="mt-7 mb-2.5 text-sm font-medium text-text-primary">
            Where does your team track execution? <span className="font-normal text-text-muted">(context only — integrations come later)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {EXECUTION_TOOL_OPTIONS.map((o) => (
              <ChoicePill
                key={o.value}
                selected={executionTool === o.value}
                onClick={() => setExecutionTool(o.value)}
                label={o.label}
              />
            ))}
          </div>

          <Nav busy={busy} onBack={() => setStep(3)} onNext={() => advance(saveExecution, 5)} />
        </Card>
      )}

      {step === 5 && (
        <ReviewSection
          productDirection={productDirection}
          success={success}
          caps={caps}
          delivery={delivery}
          methodology={methodology}
          executionTool={executionTool}
          validation={validation}
          alreadyGenerated={alreadyGenerated}
          busy={busy}
          error={error}
          onEdit={jump}
          onBack={() => setStep(4)}
          onGenerate={generate}
        />
      )}

      {error && step !== 5 && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ---------- Capabilities ----------

function CapabilitiesSection(props: {
  initiativeId: string;
  caps: CapabilityView[];
  setCaps: React.Dispatch<React.SetStateAction<CapabilityView[]>>;
  workingRole: WorkingRole | null;
  verbose: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const { initiativeId, caps, setCaps, workingRole, verbose, onBack, onNext } = props;
  const [editing, setEditing] = useState<CapabilityView | null>(null);
  const [adding, setAdding] = useState(caps.length === 0);
  const [error, setError] = useState<string | null>(null);

  const hasMvp = caps.some((c) => c.isMvp);

  const remove = async (id: string) => {
    const res = await apiFetch(`/api/capabilities/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(res.error ?? "Could not delete.");
      return;
    }
    setCaps((c) => c.filter((x) => x.id !== id));
  };

  return (
    <Card>
      <GuidanceBanner section="capabilities" workingRole={workingRole} />
      <p className="text-sm text-text-secondary">
        {verbose
          ? "List each capability the product needs. Effort size drives how big it becomes in the plan (epics/stories); MVP, business value, and risk drive what ships first and in what order — not how big it is."
          : "Effort size drives decomposition size; MVP/value/risk drive ordering and phase, not size."}
      </p>

      <ul className="mt-6 space-y-2.5">
        {caps.map((cap) => (
          <li key={cap.id} className="flex items-start justify-between gap-3 rounded-2xl border border-neutral-200 px-4 py-3.5">
            <div>
              <p className="font-medium text-text-primary">
                {cap.name}{" "}
                {cap.isMvp && (
                  <span className="ml-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-hover">MVP</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                Effort {cap.effortSize.toUpperCase()} · Value {cap.businessValue}
                {cap.dependsOn.length > 0 &&
                  ` · requires ${cap.dependsOn.map((d) => caps.find((c) => c.id === d)?.name ?? "?").join(", ")}`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2 text-xs">
              <button onClick={() => { setEditing(cap); setAdding(false); }} className="font-medium text-accent hover:underline">Edit</button>
              <button onClick={() => remove(cap.id)} className="font-medium text-red-500 hover:underline">Remove</button>
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
            setCaps((c) => (editing ? c.map((x) => (x.id === saved.id ? saved : x)) : [...c, saved]));
            setEditing(null);
            setAdding(false);
          }}
          onCancel={() => { setEditing(null); setAdding(false); }}
        />
      )}

      {!adding && !editing && (
        <button onClick={() => setAdding(true)} className="mt-4 rounded-xl border border-dashed border-accent/40 px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent/5">
          + Add a capability
        </button>
      )}

      {caps.length > 0 && !hasMvp && (
        <p className="mt-4 text-sm text-amber-700">Mark at least one capability as MVP to continue.</p>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <Nav busy={false} onBack={onBack} onNext={onNext} nextDisabled={caps.length === 0} />
    </Card>
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
    riskLevel: existing?.riskLevel ?? "medium",
    mvpImportance: existing?.mvpImportance ?? null,
    customerImpactScore: existing?.customerImpactScore ?? null,
    revenueImpactScore: existing?.revenueImpactScore ?? null,
    strategicAlignmentScore: existing?.strategicAlignmentScore ?? null,
    riskComplianceScore: existing?.riskComplianceScore ?? null,
    dependsOn: existing?.dependsOn ?? [],
  });
  const [advancedValue, setAdvancedValue] = useState(existing != null && existing.customerImpactScore != null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const factors = {
    customerImpactScore: form.customerImpactScore,
    revenueImpactScore: form.revenueImpactScore,
    strategicAlignmentScore: form.strategicAlignmentScore,
    riskComplianceScore: form.riskComplianceScore,
  };
  const scoringComplete = isAdvancedScoringComplete(factors);
  const factorScore = scoringComplete
    ? Math.round(
        (factors.customerImpactScore! * 0.3 +
          factors.revenueImpactScore! * 0.3 +
          factors.strategicAlignmentScore! * 0.25 +
          factors.riskComplianceScore! * 0.15) *
          100,
      ) / 100
    : null;

  const save = async () => {
    setBusy(true);
    setError(null);
    const level =
      factorScore == null || !advancedValue
        ? form.businessValue
        : factorScore >= 4.5 ? "critical" : factorScore >= 3.5 ? "high" : factorScore >= 2.5 ? "medium" : factorScore >= 1.5 ? "low" : "very_low";
    const body = {
      ...form,
      businessValue: level,
      // All-or-nothing: only submit the four scores when every one is present, otherwise
      // clear them — a partial set must never reach the engine (docs/V2-QUESTIONNAIRE-MAP.md §9).
      ...(advancedValue && scoringComplete
        ? {}
        : { customerImpactScore: null, revenueImpactScore: null, strategicAlignmentScore: null, riskComplianceScore: null }),
    };
    const res = existing
      ? await apiFetch(`/api/capabilities/${existing.id}`, { method: "PATCH", body })
      : await apiFetch<{ capabilityId: string }>(`/api/initiatives/${initiativeId}/capabilities`, { method: "POST", body });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save.");
      return;
    }
    const id = existing?.id ?? (res.data as { capabilityId: string }).capabilityId;
    onSaved({ id, ...body });
  };

  return (
    <div className="mt-4 rounded-2xl border border-accent/20 bg-accent/[0.03] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Basics</p>
      <label className="mt-2 block text-sm font-medium text-text-primary">
        Capability name
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Bulk CSV import"
          className={`mt-1 w-full ${FIELD_CLASS}`} autoFocus />
      </label>
      <label className="mt-3 block text-sm font-medium text-text-primary">
        What it does <span className="font-normal text-text-muted">(optional)</span>
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="One sentence"
          className={`mt-1 w-full ${FIELD_CLASS}`} />
      </label>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-accent">Sizing &amp; Priority</p>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-text-primary">Required for the MVP?</p>
          <div className="mt-1.5 flex gap-2">
            {[true, false].map((v) => (
              <ChoicePill key={String(v)} selected={form.isMvp === v} onClick={() => setForm({ ...form, isMvp: v })}
                label={v ? "Yes — MVP" : "No — later"} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">Level of effort</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {EFFORT_OPTIONS.map((o) => (
              <ChoicePill key={o.value} selected={form.effortSize === o.value}
                onClick={() => setForm({ ...form, effortSize: o.value })} label={o.label} />
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-text-primary">
            Business value {advancedValue && <span className="font-normal text-text-muted">(set from weighted factors below)</span>}
          </p>
          <div className={`mt-1.5 flex flex-wrap gap-2 ${advancedValue ? "opacity-50" : ""}`}>
            {VALUE_OPTIONS.map((o) => (
              <ChoicePill key={o.value} selected={form.businessValue === o.value}
                onClick={() => !advancedValue && setForm({ ...form, businessValue: o.value })} label={o.label} />
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-text-primary">Risk level</p>
          <p className="mt-0.5 text-xs text-text-muted">High-risk MVP work is scheduled earlier to reduce uncertainty.</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {RISK_OPTIONS.map((o) => (
              <ChoicePill key={o.value} selected={form.riskLevel === o.value}
                onClick={() => setForm({ ...form, riskLevel: o.value })} label={o.label} />
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-text-primary">
            MVP importance <span className="font-normal text-text-muted">(optional override)</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {MVP_IMPORTANCE_OPTIONS.map((o) => (
              <ChoicePill key={o.value} selected={(form.mvpImportance ?? "") === o.value}
                onClick={() => setForm({ ...form, mvpImportance: o.value || null })} label={o.label} />
            ))}
          </div>
        </div>
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-accent">Dependencies</p>
      <div className="mt-2">
        <p className="text-sm font-medium text-text-primary">Does this capability require another capability to exist first?</p>
        {others.length === 0 ? (
          <p className="mt-1 text-xs text-text-muted">No other capabilities yet — add more to set dependencies.</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {others.map((o) => (
              <ChoicePill key={o.id} selected={form.dependsOn.includes(o.id)}
                onClick={() => setForm({
                  ...form,
                  dependsOn: form.dependsOn.includes(o.id)
                    ? form.dependsOn.filter((d) => d !== o.id)
                    : [...form.dependsOn, o.id],
                })}
                label={o.name} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-5">
        <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <input type="checkbox" checked={advancedValue} onChange={(e) => setAdvancedValue(e.target.checked)} />
          Score business value from weighted factors (optional)
        </label>
        {advancedValue && (
          <div className="mt-3 rounded-xl border border-accent/20 bg-white p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["customerImpactScore", "Customer impact (30%)"],
                ["revenueImpactScore", "Revenue or cost impact (30%)"],
                ["strategicAlignmentScore", "Strategic alignment (25%)"],
                ["riskComplianceScore", "Risk or compliance impact (15%)"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <p className="text-sm font-medium text-text-primary">{label}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <ChoicePill key={n} selected={form[key] === n}
                        onClick={() => setForm({ ...form, [key]: n })} label={String(n)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              {!scoringComplete
                ? "Score all four factors (1–5) — a partial set is not used."
                : `Weighted business value: ${factorScore} out of 5 — sets the level above automatically.`}
            </p>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={busy || form.name.trim().length < 3 || (advancedValue && !scoringComplete)}>
          {busy ? "Saving…" : existing ? "Save changes" : "Add capability"}
        </Button>
      </div>
    </div>
  );
}

// ---------- Review ----------

function ReviewSection(props: {
  productDirection: ProductDirectionValues;
  success: SuccessValues;
  caps: CapabilityView[];
  delivery: DeliveryValues;
  methodology: MethodologyAnswer;
  executionTool: string;
  validation: { errors: Flag[]; warnings: Flag[] } | null;
  alreadyGenerated: boolean;
  busy: boolean;
  error: string | null;
  onEdit: (step: number) => void;
  onBack: () => void;
  onGenerate: () => void;
}) {
  const { productDirection, success, caps, delivery, methodology, executionTool, validation, alreadyGenerated, busy, error, onEdit, onBack, onGenerate } = props;
  const methodologyLabel = METHODOLOGY_OPTIONS.find((o) => o.value === methodology)?.label ?? methodology;
  const executionToolLabel = EXECUTION_TOOL_OPTIONS.find((o) => o.value === executionTool)?.label ?? executionTool;

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-md md:p-10">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Complete</p>
      <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-primary">
        {alreadyGenerated ? "Review your plan" : "Review & generate"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
        {alreadyGenerated
          ? "Your edits are saved as you go — use Recalculate in the workspace to apply them to the live plan."
          : "Everything below feeds the generator. Edit any section, then generate when ready."}
      </p>

      <ReviewBlock title="Product Direction" onEdit={() => onEdit(0)}>
        <ReviewRow label="Initiative" value={productDirection.name} />
        <ReviewRow label="Problem" value={productDirection.problemStatement || "—"} />
        <ReviewRow label="Target customer" value={productDirection.targetCustomer || "—"} />
      </ReviewBlock>

      <ReviewBlock title="Success" onEdit={() => onEdit(1)}>
        <ReviewRow label="Outcome" value={success.outcomeStatement || "—"} />
        <ReviewRow label="Metric" value={success.outcomeMetric || "—"} />
        <ReviewRow label="Launch date" value={success.targetLaunchDate || "—"} />
        <ReviewRow label="Budget" value={success.budget ? `$${success.budget}` : "—"} />
      </ReviewBlock>

      <ReviewBlock title={`Capabilities (${caps.length})`} onEdit={() => onEdit(2)}>
        {caps.length === 0 ? (
          <p className="text-sm text-neutral-500">None yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {caps.map((c) => (
              <li key={c.id} className="text-neutral-700">
                <span className="font-medium">{c.name}</span> — {c.isMvp ? "MVP" : "Later"} · Effort {c.effortSize.toUpperCase()} · Value {c.businessValue} · Risk {c.riskLevel}
                {c.dependsOn.length > 0 && ` · requires ${c.dependsOn.map((d) => caps.find((x) => x.id === d)?.name ?? "?").join(", ")}`}
              </li>
            ))}
          </ul>
        )}
      </ReviewBlock>

      <ReviewBlock title="Delivery" onEdit={() => onEdit(3)}>
        <ReviewRow label="Team size" value={delivery.teamSize === "" ? "—" : String(delivery.teamSize)} />
        <div className="mt-2 rounded-lg bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
          Planning assumptions in effect: {delivery.sprintLengthWeeks}-week sprint · {delivery.utilizationRatePercent}% utilization
          · {delivery.capacityBufferPercent}% capacity buffer · {delivery.hoursPerStoryPoint} hrs/story point ·
          {" "}${delivery.averageHourlyRate || "85"}/hour
          {delivery.historicalVelocityPoints !== "" && ` · historical velocity ${delivery.historicalVelocityPoints} pts/sprint`}
        </div>
      </ReviewBlock>

      <ReviewBlock title="Execution" onEdit={() => onEdit(4)}>
        <ReviewRow label="Methodology" value={methodologyLabel} />
        <ReviewRow label="Execution tool" value={executionToolLabel} />
      </ReviewBlock>

      {validation === null ? (
        <p className="mt-6 text-sm text-text-muted">Checking your answers…</p>
      ) : (
        <div className="mt-6 space-y-3">
          {validation.errors.length === 0 && validation.warnings.length === 0 && (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Everything checks out{alreadyGenerated ? "." : ". Ready to generate."}
            </p>
          )}
          {validation.errors.map((f, i) => (
            <p key={`e${i}`} className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"><strong>Fix required:</strong> {f.message}</p>
          ))}
          {validation.warnings.map((f, i) => (
            <p key={`w${i}`} className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"><strong>Heads-up:</strong> {f.message}</p>
          ))}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-7 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
        <Button
          onClick={onGenerate}
          disabled={busy || (!alreadyGenerated && (!validation || validation.errors.length > 0))}
          className="px-6 py-3"
        >
          {busy ? "Generating your prototype…" : alreadyGenerated ? "Save & view plan →" : "Generate working prototype"}
        </Button>
      </div>
    </div>
  );
}

function ReviewBlock(props: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-t border-neutral-100 pt-5 first:mt-5 first:border-0 first:pt-0">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{props.title}</h3>
        <button onClick={props.onEdit} className="text-xs font-semibold text-accent hover:underline">Edit</button>
      </div>
      <div className="mt-2">{props.children}</div>
    </div>
  );
}

function ReviewRow(props: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <span className="text-text-muted">{props.label}: </span>
      <span className="text-text-primary">{props.value}</span>
    </p>
  );
}

// ---------- shared pieces ----------

function Card(props: { children: React.ReactNode }) {
  return <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-md md:p-10">{props.children}</div>;
}

function Nav(props: { busy: boolean; onBack?: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="mt-8 flex items-center justify-between">
      {props.onBack ? (
        <Button variant="ghost" onClick={props.onBack}>← Back</Button>
      ) : <span />}
      <Button onClick={props.onNext} disabled={props.busy || props.nextDisabled} className="px-6 py-3">
        {props.busy ? "Saving…" : "Continue →"}
      </Button>
    </div>
  );
}

function NumberField(props: { label: string; value: number | ""; min: number; max: number; onChange: (v: number | null) => void }) {
  return (
    <label className="block text-sm font-medium text-text-primary">
      {props.label}
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        onChange={(e) => props.onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={`mt-1 w-full ${FIELD_CLASS}`}
      />
    </label>
  );
}

function CapacityPreview(props: { delivery: DeliveryValues }) {
  const { delivery: d } = props;
  if (!d.teamSize || d.teamSize <= 0) return null;
  const available = d.teamSize * d.hoursPerSprintPerMember * (d.utilizationRatePercent / 100);
  const usable = available * (1 - d.capacityBufferPercent / 100);
  const estimated = Math.max(1, Math.floor(usable / d.hoursPerStoryPoint));
  const capped = d.historicalVelocityPoints && d.historicalVelocityPoints > 0 ? Math.min(estimated, d.historicalVelocityPoints) : estimated;
  return (
    <div className="mt-4 rounded-xl bg-accent/[0.06] px-4 py-3 text-sm text-accent-hover">
      <p>
        {available.toFixed(0)} available hours → {usable.toFixed(0)} usable after the {d.capacityBufferPercent}% buffer → ÷{d.hoursPerStoryPoint}{" "}
        hrs/point = <strong>{capped} points</strong> per {d.sprintLengthWeeks}-week sprint
        {capped !== estimated && " (capped by historical velocity)"}.
      </p>
      <p className="mt-1 text-xs text-accent">Estimated point capacity based on current planning assumptions.</p>
    </div>
  );
}
