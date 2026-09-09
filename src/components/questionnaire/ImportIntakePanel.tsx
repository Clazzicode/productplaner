"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import Button from "@/components/ui/Button";
import type { CapabilityView, SuccessValues } from "./PlanningQuestionnaire";
import type { ProductDirectionValues } from "./ProductDirectionFields";

interface CapabilityDraft {
  name: string;
  description?: string;
  isMvp?: boolean;
  effortSize?: string;
  businessValue?: string;
  riskLevel?: string;
}

interface IntakeImportDraft {
  productDirection?: Partial<Pick<ProductDirectionValues, "name" | "problemStatement" | "targetCustomer">>;
  success?: { outcomeStatement?: string; outcomeMetric?: string; targetLaunchDate?: string; budget?: number };
  capabilities?: CapabilityDraft[];
  warnings?: string[];
}

// Fallback values for capability fields the model didn't set — matches the initial
// state of the manual "add a capability" form (CapabilityForm in PlanningQuestionnaire)
// so an unscored imported capability behaves exactly like a freshly hand-added one.
const CAPABILITY_DEFAULTS = { isMvp: true, effortSize: "m", businessValue: "high", riskLevel: "medium" } as const;

type FieldRow = { key: string; label: string; current: string; suggested: string };

/** Single source of truth for which draft fields are shown/applied, and what
 * their current-vs-suggested values are — used both to render the review list
 * and to seed default checkbox state right after a draft comes back. */
function buildFieldRows(
  draft: IntakeImportDraft,
  productDirection: ProductDirectionValues,
  success: SuccessValues,
): FieldRow[] {
  const rows: (FieldRow | false)[] = [
    draft.productDirection?.name != null && {
      key: "pd.name",
      label: "Initiative name",
      current: productDirection.name,
      suggested: draft.productDirection.name,
    },
    draft.productDirection?.problemStatement != null && {
      key: "pd.problemStatement",
      label: "Problem statement",
      current: productDirection.problemStatement,
      suggested: draft.productDirection.problemStatement,
    },
    draft.productDirection?.targetCustomer != null && {
      key: "pd.targetCustomer",
      label: "Target customer",
      current: productDirection.targetCustomer,
      suggested: draft.productDirection.targetCustomer,
    },
    draft.success?.outcomeStatement != null && {
      key: "success.outcomeStatement",
      label: "Desired outcome",
      current: success.outcomeStatement,
      suggested: draft.success.outcomeStatement,
    },
    draft.success?.outcomeMetric != null && {
      key: "success.outcomeMetric",
      label: "Success metric",
      current: success.outcomeMetric,
      suggested: draft.success.outcomeMetric,
    },
    draft.success?.targetLaunchDate != null && {
      key: "success.targetLaunchDate",
      label: "Projected go-live date",
      current: success.targetLaunchDate,
      suggested: draft.success.targetLaunchDate,
    },
    draft.success?.budget != null && {
      key: "success.budget",
      label: "Budget",
      current: success.budget ? `$${success.budget}` : "",
      suggested: `$${draft.success.budget}`,
    },
  ];
  return rows.filter((r): r is FieldRow => r !== false);
}

export default function ImportIntakePanel(props: {
  initiativeId: string;
  productDirection: ProductDirectionValues;
  success: SuccessValues;
  onApplyProductDirection: (patch: Partial<ProductDirectionValues>) => void;
  onApplySuccess: (patch: Partial<SuccessValues>) => void;
  onCapabilityAdded: (cap: CapabilityView) => void;
}) {
  const { initiativeId, productDirection, success, onApplyProductDirection, onApplySuccess, onCapabilityAdded } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<IntakeImportDraft | null>(null);
  const [sourceFileName, setSourceFileName] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState<string | null>(null);

  const fieldRows = draft ? buildFieldRows(draft, productDirection, success) : [];
  const capabilityDrafts = draft?.capabilities ?? [];

  const openFilePicker = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-choosing the same file after a failed attempt
    if (!file) return;

    setOpen(true);
    setBusy(true);
    setError(null);
    setDraft(null);
    setApplied(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/initiatives/${initiativeId}/intake/import`, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as {
        draft?: IntakeImportDraft;
        sourceFileName?: string;
        error?: string;
      };
      if (!res.ok || !body.draft) {
        setError(body.error ?? `Import failed (${res.status}).`);
        return;
      }
      setDraft(body.draft);
      setSourceFileName(body.sourceFileName ?? file.name);

      const initialSelection: Record<string, boolean> = {};
      for (const row of buildFieldRows(body.draft, productDirection, success)) {
        initialSelection[row.key] = row.current.trim().length === 0;
      }
      (body.draft.capabilities ?? []).forEach((_, i) => {
        initialSelection[`cap.${i}`] = true;
      });
      setSelected(initialSelection);
    } catch {
      setError("Network error — is the dev server running?");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: string) => setSelected((s) => ({ ...s, [key]: !s[key] }));

  const apply = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);

    const pdPatch: Partial<ProductDirectionValues> = {};
    if (selected["pd.name"] && draft.productDirection?.name) pdPatch.name = draft.productDirection.name;
    if (selected["pd.problemStatement"] && draft.productDirection?.problemStatement)
      pdPatch.problemStatement = draft.productDirection.problemStatement;
    if (selected["pd.targetCustomer"] && draft.productDirection?.targetCustomer)
      pdPatch.targetCustomer = draft.productDirection.targetCustomer;
    if (Object.keys(pdPatch).length > 0) onApplyProductDirection(pdPatch);

    const successPatch: Partial<SuccessValues> = {};
    if (selected["success.outcomeStatement"] && draft.success?.outcomeStatement)
      successPatch.outcomeStatement = draft.success.outcomeStatement;
    if (selected["success.outcomeMetric"] && draft.success?.outcomeMetric)
      successPatch.outcomeMetric = draft.success.outcomeMetric;
    if (selected["success.targetLaunchDate"] && draft.success?.targetLaunchDate)
      successPatch.targetLaunchDate = draft.success.targetLaunchDate;
    if (selected["success.budget"] && draft.success?.budget != null) successPatch.budget = String(draft.success.budget);
    if (Object.keys(successPatch).length > 0) onApplySuccess(successPatch);

    let capsApplied = 0;
    for (let i = 0; i < capabilityDrafts.length; i++) {
      if (!selected[`cap.${i}`]) continue;
      const c = capabilityDrafts[i];
      const body = {
        name: c.name,
        description: c.description ?? "",
        isMvp: c.isMvp ?? CAPABILITY_DEFAULTS.isMvp,
        effortSize: c.effortSize ?? CAPABILITY_DEFAULTS.effortSize,
        businessValue: c.businessValue ?? CAPABILITY_DEFAULTS.businessValue,
        riskLevel: c.riskLevel ?? CAPABILITY_DEFAULTS.riskLevel,
        mvpImportance: null,
        customerImpactScore: null,
        revenueImpactScore: null,
        strategicAlignmentScore: null,
        riskComplianceScore: null,
        dependsOn: [] as string[],
      };
      const res = await apiFetch<{ capabilityId: string }>(`/api/initiatives/${initiativeId}/capabilities`, {
        method: "POST",
        body,
      });
      if (res.ok && res.data) {
        onCapabilityAdded({ id: res.data.capabilityId, ...body });
        capsApplied++;
      }
    }

    setBusy(false);
    const fieldsApplied = Object.keys(pdPatch).length + Object.keys(successPatch).length;
    setApplied(
      `Applied ${fieldsApplied} field${fieldsApplied === 1 ? "" : "s"} and ${capsApplied} feature${capsApplied === 1 ? "" : "s"} from ${sourceFileName}.`,
    );
    setDraft(null);
  };

  const dismiss = () => {
    setOpen(false);
    setDraft(null);
    setError(null);
    setApplied(null);
  };

  return (
    <div className="mb-7">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pptx,.docx,.pdf"
        className="hidden"
        onChange={(e) => void onFileChosen(e)}
      />

      {!open && (
        <button
          type="button"
          onClick={openFilePicker}
          className="w-full rounded-xl border border-dashed border-accent/40 px-4 py-3 text-left text-sm font-semibold text-accent hover:bg-accent/5"
        >
          ⤒ Import from a document (PPTX, DOCX, PDF) — AI-fill this and the roadmap
        </button>
      )}

      {open && (
        <div className="rounded-2xl border border-accent/20 bg-accent/[0.03] p-5">
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Import from a document</p>
            <button onClick={dismiss} className="text-xs font-medium text-text-muted hover:text-text-primary">
              Close
            </button>
          </div>

          {busy && !draft && <p className="mt-3 text-sm text-text-secondary">Analyzing your document…</p>}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {applied && <p className="mt-3 text-sm text-emerald-700">{applied}</p>}

          {draft && (
            <div className="mt-3">
              <p className="text-sm text-text-secondary">
                Extracted from <span className="font-medium">{sourceFileName}</span> — review and pick what to keep.
                Nothing is saved until you click Apply.
              </p>

              {fieldRows.length === 0 && capabilityDrafts.length === 0 && (
                <p className="mt-3 text-sm text-amber-700">Nothing usable was found in that document.</p>
              )}

              {fieldRows.length > 0 && (
                <ul className="mt-4 space-y-2.5">
                  {fieldRows.map((row) => (
                    <li key={row.key} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={!!selected[row.key]}
                          onChange={() => toggle(row.key)}
                        />
                        <span className="flex-1">
                          <span className="block text-sm font-medium text-text-primary">{row.label}</span>
                          <span className="mt-0.5 block text-sm text-accent-hover">{row.suggested}</span>
                          {row.current.trim().length > 0 && (
                            <span className="mt-0.5 block text-xs text-text-muted">Current: {row.current}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              {capabilityDrafts.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                    Features ({capabilityDrafts.length})
                  </p>
                  <ul className="mt-2 space-y-2.5">
                    {capabilityDrafts.map((c, i) => (
                      <li key={i} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={!!selected[`cap.${i}`]}
                            onChange={() => toggle(`cap.${i}`)}
                          />
                          <span className="flex-1">
                            <span className="block text-sm font-medium text-text-primary">
                              {c.name}
                              {c.isMvp === true && (
                                <span className="ml-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-hover">
                                  MVP
                                </span>
                              )}
                            </span>
                            {c.description && (
                              <span className="mt-0.5 block text-xs text-text-secondary">{c.description}</span>
                            )}
                            <span className="mt-1 block text-xs text-text-muted">
                              Effort {(c.effortSize ?? CAPABILITY_DEFAULTS.effortSize).toUpperCase()} · Value{" "}
                              {c.businessValue ?? CAPABILITY_DEFAULTS.businessValue} · Risk{" "}
                              {c.riskLevel ?? CAPABILITY_DEFAULTS.riskLevel}
                              {(c.effortSize == null || c.businessValue == null || c.riskLevel == null) &&
                                " (defaulted — not stated)"}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {draft.warnings && draft.warnings.length > 0 && (
                <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  {draft.warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-3">
                <Button variant="ghost" onClick={dismiss}>
                  Discard
                </Button>
                <Button onClick={() => void apply()} disabled={busy}>
                  {busy ? "Applying…" : "Apply selected"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
