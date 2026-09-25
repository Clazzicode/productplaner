"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import AiExplainBadge from "./AiExplainBadge";

// One AI Assist card: Synopsis (always visible) -> Details (AiExplainBadge
// popover) -> Action (Apply/Edit/Dismiss), per Section 4 §20-23. Nothing is
// auto-applied — every write here is a direct result of this component's
// own explicit button click.

export interface AiAssistItemDTO {
  id: string;
  actionKey: string;
  status: string;
  title: string;
  synopsis: string;
  informationUsed: string;
  why: string;
  impact: string;
  assumptionsJson: string;
  sourcesJson: string;
  rulesAppliedJson: string;
  proposedContentJson: string;
}

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const STATUS_LABEL: Record<string, string> = {
  proposed: "Suggested",
  stale: "May need an update",
  applied: "Applied",
  edited_and_applied: "Applied (edited)",
  dismissed: "Dismissed",
  superseded: "Replaced by a newer suggestion",
};

// Categories with no direct write through /apply — release/sprint
// recommendations apply through their own existing form (Section 4 §5);
// roadmap insights are read-only observations with nothing to write at all.
const NO_DIRECT_APPLY = new Set(["ROADMAP_INSIGHTS", "RECOMMEND_RELEASES", "RECOMMEND_SPRINTS"]);

export default function AiAssistItemCard(props: { item: AiAssistItemDTO; onChanged: () => void }) {
  const { item } = props;
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const assumptions = parseJsonArray(item.assumptionsJson);
  const sources = parseJsonArray(item.sourcesJson);
  const rulesApplied = parseJsonArray(item.rulesAppliedJson);
  const isActionable = item.status === "proposed" || item.status === "stale";
  const canApplyDirectly = isActionable && !NO_DIRECT_APPLY.has(item.actionKey);

  async function apply(confirmApprovedImpact = false) {
    setBusy(true);
    setError(null);
    let editedContent: unknown;
    if (editedText !== null) {
      try {
        editedContent = JSON.parse(editedText);
      } catch {
        setError("Edited content isn't valid — check the JSON and try again.");
        setBusy(false);
        return;
      }
    }
    const result = await apiFetch(`/api/ai-assist-items/${item.id}/apply`, {
      method: "POST",
      body: { editedContent, confirmApprovedImpact: confirmApprovedImpact || undefined },
    });
    setBusy(false);
    if (!result.ok) {
      const data = result.data as { requiresApprovedImpactConfirmation?: boolean } | undefined;
      if (data?.requiresApprovedImpactConfirmation) {
        setNeedsConfirm(true);
        return;
      }
      setError(result.error ?? "Could not apply this suggestion.");
      return;
    }
    props.onChanged();
  }

  async function dismiss() {
    setBusy(true);
    setError(null);
    const result = await apiFetch(`/api/ai-assist-items/${item.id}/dismiss`, { method: "POST", body: {} });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not dismiss this suggestion.");
      return;
    }
    props.onChanged();
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">{item.title}</p>
          <p className="mt-1 text-sm text-text-secondary">{item.synopsis}</p>
        </div>
        <span className="shrink-0 rounded-full border border-neutral-200 px-2 py-0.5 text-[11px] font-medium text-text-muted">
          {STATUS_LABEL[item.status] ?? item.status}
        </span>
      </div>

      {assumptions.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-semibold">⚠ Assumption{assumptions.length > 1 ? "s" : ""}: </span>
          {assumptions.join(" · ")}
        </div>
      )}

      {item.status === "stale" && (
        <p className="mt-2 text-xs text-amber-700">
          The information this was based on has changed since it was generated. Review before applying.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AiExplainBadge
          informationUsed={item.informationUsed}
          why={item.why}
          impact={item.impact}
          assumptions={assumptions}
          sources={sources}
          rulesApplied={rulesApplied}
        />

        {isActionable && (
          <>
            {canApplyDirectly && (
              <button
                type="button"
                disabled={busy}
                onClick={() => apply()}
                className="rounded-full bg-accent px-3 py-1 text-[11px] font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
              >
                Apply
              </button>
            )}
            {canApplyDirectly && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing((v) => !v);
                  if (editedText === null) setEditedText(item.proposedContentJson);
                }}
                className="rounded-full border border-neutral-300 px-3 py-1 text-[11px] font-medium text-text-secondary transition hover:bg-neutral-50 disabled:opacity-50"
              >
                Edit
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={dismiss}
              className="rounded-full border border-neutral-300 px-3 py-1 text-[11px] font-medium text-text-secondary transition hover:bg-neutral-50 disabled:opacity-50"
            >
              Dismiss
            </button>
          </>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs text-text-muted">Edit the content below, then Apply — your edit is what gets saved, not the original suggestion.</p>
          <textarea
            value={editedText ?? ""}
            onChange={(e) => setEditedText(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-neutral-300 bg-white p-2 font-mono text-xs text-text-primary"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => apply()}
            className="rounded-full bg-accent px-3 py-1 text-[11px] font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
          >
            Apply edited version
          </button>
        </div>
      )}

      {needsConfirm && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <p>This initiative has an approved baseline. Applying this will change approved work.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => apply(true)}
              className="rounded-full bg-amber-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Apply anyway
            </button>
            <button
              type="button"
              onClick={() => setNeedsConfirm(false)}
              className="rounded-full border border-amber-300 px-3 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
            >
              Keep current plan
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
