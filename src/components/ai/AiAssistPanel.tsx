"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import AiAssistItemCard, { type AiAssistItemDTO } from "./AiAssistItemCard";
import GenerationProgress from "@/components/ui/loading/GenerationProgress";
import { useAiJobStatus } from "@/lib/ai/useAiJobPolling";
import { AI_ASSIST_ACTION_COPY, AI_ASSIST_STEP_ORDER, JOB_STATUS_STEP_LABEL } from "@/lib/ai/activityCopy";
import type { AiActionKey } from "@/lib/ai/types";

// Contextual AI Assist side panel (Section 4 §6-9/§21-23) — mounted beside
// the primary planning view (roadmap/features/sprints), never in place of
// it. Every action here is a Draft/Proposed suggestion the user reviews and
// applies or dismisses; nothing changes the plan on its own.

type Scope = "roadmap" | "features" | "sprints";

const SCOPE_ACTIONS: Record<Scope, AiActionKey[]> = {
  roadmap: ["ROADMAP_INSIGHTS", "RECOMMEND_RELEASES", "RECOMMEND_STATUS"],
  features: ["PROPOSE_FEATURES", "PROPOSE_DEPENDENCIES", "PROPOSE_RISKS"],
  sprints: ["RECOMMEND_SPRINTS"],
};

// Only the actions that need no extra parameter from the user get a
// "Generate" affordance in this general panel. PROPOSE_STORY_CONTENT
// (needs a specific feature) is reachable through the same API but doesn't
// have a dedicated trigger here yet — a natural next step is a small
// per-feature "Suggest better wording" button on the Features page itself.
const TRIGGER_PATH: Partial<Record<AiActionKey, string>> = {
  ROADMAP_INSIGHTS: "roadmap-insights",
  PROPOSE_FEATURES: "features",
  PROPOSE_DEPENDENCIES: "dependencies",
  PROPOSE_RISKS: "risks",
  RECOMMEND_RELEASES: "releases",
  RECOMMEND_SPRINTS: "sprints",
  RECOMMEND_STATUS: "status",
};

const PREVIEW_STEPS = AI_ASSIST_STEP_ORDER.map((s) => JOB_STATUS_STEP_LABEL[s]);

interface PendingJob {
  id: string;
  status: string;
  actionKey: string;
}
interface ListResponse {
  items: AiAssistItemDTO[];
  pendingJobs: PendingJob[];
}

export default function AiAssistPanel(props: { initiativeId: string; scope: Scope }) {
  const { initiativeId, scope } = props;
  const actionKeys = SCOPE_ACTIONS[scope];
  const [items, setItems] = useState<AiAssistItemDTO[]>([]);
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<AiActionKey | null>(null);
  const [triggering, setTriggering] = useState<AiActionKey | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await apiFetch<ListResponse>(`/api/initiatives/${initiativeId}/ai-assist?scope=${scope}`);
    if (result.ok && result.data) {
      setItems(result.data.items);
      setPendingJobs(result.data.pendingJobs);
    }
    setLoading(false);
  }, [initiativeId, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  async function trigger(action: AiActionKey) {
    const path = TRIGGER_PATH[action];
    if (!path) return;
    setTriggering(action);
    setTriggerError(null);
    const body = action === "RECOMMEND_STATUS" ? { entityType: "initiative", entityId: initiativeId } : {};
    const result = await apiFetch(`/api/initiatives/${initiativeId}/ai-assist/${path}`, { method: "POST", body });
    setTriggering(null);
    setConfirming(null);
    if (!result.ok) {
      setTriggerError(result.error ?? "Could not generate this right now.");
      return;
    }
    await load();
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-text-muted">Loading AI Assist…</div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">AI Assist</h3>
        <p className="text-xs text-text-muted">
          Optional suggestions alongside your plan. Nothing here changes your plan unless you apply it.
        </p>
      </div>

      {actionKeys.map((action) => {
        const copy = AI_ASSIST_ACTION_COPY[action];
        const activeItems = items.filter(
          (i) => i.actionKey === action && i.status !== "superseded" && i.status !== "dismissed",
        );
        const pendingJob = pendingJobs.find((j) => j.actionKey === action) ?? null;
        const canTrigger = TRIGGER_PATH[action] !== undefined;

        return (
          <div key={action} className="space-y-2">
            {activeItems.length > 0 && activeItems.map((item) => <AiAssistItemCard key={item.id} item={item} onChanged={load} />)}

            {activeItems.length === 0 && pendingJob && <PendingJobCard jobId={pendingJob.id} title={copy.title} onSettled={load} />}

            {activeItems.length === 0 && !pendingJob && canTrigger && confirming === action && (
              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <p className="rounded-xl border border-accent/15 bg-accent/[0.04] px-4 py-3 text-sm text-text-secondary">
                  {copy.explanation}
                </p>
                {triggering === action ? (
                  <div className="mt-3">
                    <GenerationProgress title={copy.title} steps={PREVIEW_STEPS} currentStep={-1} />
                    <p className="mt-2 text-xs text-text-muted">This can take a few seconds…</p>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => trigger(action)}
                      className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
                    >
                      {copy.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeItems.length === 0 && !pendingJob && canTrigger && confirming !== action && (
              <button
                type="button"
                onClick={() => setConfirming(action)}
                className="w-full rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-left text-sm text-text-secondary transition hover:border-accent/40 hover:bg-accent/[0.03]"
              >
                {copy.title}
              </button>
            )}
          </div>
        );
      })}

      {triggerError && <p className="text-xs text-red-600">{triggerError}</p>}
    </div>
  );
}

function PendingJobCard(props: { jobId: string; title: string; onSettled: () => void }) {
  const { progress } = useAiJobStatus(props.jobId, { onSettled: props.onSettled });
  if (!progress) return null;
  return <GenerationProgress title={props.title} steps={progress.steps} currentStep={progress.currentStep} />;
}
