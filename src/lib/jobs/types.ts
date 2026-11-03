import type { BackgroundJob } from "@prisma/client";

export const BACKGROUND_JOB_TYPES = ["plan.generate"] as const;
export type BackgroundJobType = (typeof BACKGROUND_JOB_TYPES)[number];

export type ClaimedBackgroundJob = BackgroundJob;

export interface PlanGenerateJobPayload {
  initiativeId: string;
  mode: "full" | "respect_locks";
  confirmApprovedImpact: boolean;
}

