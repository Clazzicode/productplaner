"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { stepsForJobStatus } from "./activityCopy";
import type { AiJobStatus } from "./types";

// Refresh-resumability (Section 4 §6/§33): the caller passes whatever
// pendingJob.id the panel's own list read already found (no client-side
// storage needed — see GET /api/initiatives/[id]/ai-assist). Polls only
// while the job is non-terminal; never drives GenerationProgress off a
// timer — every step change here comes from a real AiJob.status read.

interface AiJobPollResult {
  id: string;
  status: AiJobStatus;
  actionKey: string;
  errorMessage: string | null;
}

const TERMINAL: AiJobStatus[] = ["completed", "failed", "cancelled"];

export function useAiJobStatus(jobId: string | null, options?: { intervalMs?: number; onSettled?: () => void }) {
  const intervalMs = options?.intervalMs ?? 1500;
  const [status, setStatus] = useState<AiJobStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Which jobId the state above actually belongs to — lets a stale/previous
  // job's status never leak into the display for a new/null jobId without a
  // synchronous reset inside the effect below.
  const [statusForJobId, setStatusForJobId] = useState<string | null>(null);

  const onSettledRef = useRef(options?.onSettled);
  useEffect(() => {
    onSettledRef.current = options?.onSettled;
  });

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const result = await apiFetch<AiJobPollResult>(`/api/ai-jobs/${jobId}`);
      if (cancelled) return;
      if (result.ok && result.data) {
        setStatus(result.data.status);
        setErrorMessage(result.data.errorMessage ?? null);
        setStatusForJobId(jobId);
        if (!TERMINAL.includes(result.data.status)) {
          timer = setTimeout(poll, intervalMs);
        } else {
          onSettledRef.current?.();
        }
      }
    }
    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, intervalMs]);

  const effectiveStatus = statusForJobId === jobId ? status : null;
  const effectiveError = statusForJobId === jobId ? errorMessage : null;

  return {
    status: effectiveStatus,
    errorMessage: effectiveError,
    progress: effectiveStatus ? stepsForJobStatus(effectiveStatus) : null,
    isRunning: effectiveStatus != null && !TERMINAL.includes(effectiveStatus),
  };
}
