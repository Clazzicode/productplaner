import { z } from "zod";

export const lanes = ["now", "next", "later", "unscheduled"] as const;
export const statuses = ["planned", "in_progress", "ready_for_review", "done", "archived"] as const;
export const businessValues = ["very_low", "low", "medium", "high", "critical"] as const;
export const riskLevels = ["low", "medium", "high", "critical"] as const;
export const laneLabels = { now: "Now", next: "Next", later: "Later", unscheduled: "Unscheduled" };
export const statusLabels = { planned: "Planned", in_progress: "In progress", ready_for_review: "Ready for review", done: "Done", archived: "Archived" };
export const businessValueLabels = { very_low: "Very low", low: "Low", medium: "Medium", high: "High", critical: "Critical" };
export const riskLevelLabels = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

export const featureSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(12000),
  backlogLane: z.enum(lanes),
  backlogStatus: z.enum(statuses),
  ownerUserId: z.string().min(1).nullable(),
  isMvp: z.boolean(),
  businessValue: z.enum(businessValues),
  riskLevel: z.enum(riskLevels),
  dependsOnIds: z.array(z.string().min(1)).max(100).refine(ids => new Set(ids).size === ids.length, "Dependencies must be unique."),
}).strict();
export type FeatureInput = z.infer<typeof featureSchema>;
export type FeatureSource = { id: string; title: string; kind: string; source: string; sourceReference: string };
export type FeatureRecord = FeatureInput & {
  id: string; backlogRevision: number; backlogKey: string | null; order: number;
  owner: { id: string; name: string; email: string } | null;
  sourceRequests: FeatureSource[];
};
export type FeatureHistoryRecord = {
  id: string; action: string; reason: string; revision: number; createdAt: string;
  actor: { id: string; name: string; email: string } | null;
  changes: Record<string, { before: unknown; after: unknown }>;
};

const existingFeature = z.object({ id: z.string().min(1), revision: z.number().int().positive() }).strict();
export const backlogCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), data: featureSchema, reason: z.string().trim().max(500).optional(), existing: existingFeature.optional() }).strict()
    .superRefine((value, context) => {
      if (value.existing && (!value.reason || value.reason.length < 3)) {
        context.addIssue({ code: "custom", path: ["reason"], message: "Explain why this feature is changing." });
      }
    }),
  z.object({ action: z.literal("reorder"), items: z.array(existingFeature).min(1).max(500) }).strict(),
]);

export function featureRecord(row: {
  id: string; name: string; description: string; backlogLane: string; backlogStatus: string; backlogRevision: number; backlogKey: string | null; order: number;
  ownerUserId?: string | null; isMvp: boolean; businessValue: string; riskLevel: string;
  owner?: { id: string; name: string; email: string } | null;
  dependsOnEdges?: { toCapabilityId: string }[];
  sourceRequests?: { id: string; data: unknown }[];
}): FeatureRecord {
  const sourceRequests = (row.sourceRequests ?? []).flatMap(request => {
    const parsed = z.object({ title: z.string(), kind: z.string(), source: z.string(), sourceReference: z.string().default("") }).safeParse(request.data);
    return parsed.success ? [{ id: request.id, ...parsed.data }] : [];
  });
  const input = featureSchema.parse({
    name: row.name, description: row.description, backlogLane: row.backlogLane, backlogStatus: row.backlogStatus,
    ownerUserId: row.ownerUserId ?? null, isMvp: row.isMvp, businessValue: row.businessValue, riskLevel: row.riskLevel,
    dependsOnIds: (row.dependsOnEdges ?? []).map(edge => edge.toCapabilityId),
  });
  return {
    ...input, id: row.id, backlogRevision: row.backlogRevision, backlogKey: row.backlogKey, order: row.order,
    owner: row.owner ?? null, sourceRequests,
  };
}
