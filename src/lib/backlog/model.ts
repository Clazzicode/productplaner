import { z } from "zod";

export const lanes = ["now", "next", "later", "unscheduled"] as const;
export const statuses = ["planned", "in_progress", "ready_for_review", "done", "archived"] as const;
export const laneLabels = { now: "Now", next: "Next", later: "Later", unscheduled: "Unscheduled" };
export const statusLabels = { planned: "Planned", in_progress: "In progress", ready_for_review: "Ready for review", done: "Done", archived: "Archived" };
export const featureSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(12000),
  backlogLane: z.enum(lanes),
  backlogStatus: z.enum(statuses),
}).strict();
export type FeatureInput = z.infer<typeof featureSchema>;
export type FeatureRecord = FeatureInput & {
  id: string; backlogRevision: number; backlogKey: string | null; order: number;
};
export const backlogCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), data: featureSchema, existing: z.object({ id: z.string().min(1), revision: z.number().int().positive() }).strict().optional() }).strict(),
  z.object({ action: z.literal("reorder"), items: z.array(z.object({ id: z.string().min(1), revision: z.number().int().positive() }).strict()).min(1).max(500) }).strict(),
]);
export function featureRecord(row: Omit<FeatureRecord, "backlogLane" | "backlogStatus"> & { backlogLane: string; backlogStatus: string }): FeatureRecord {
  return { ...featureSchema.parse({ name: row.name, description: row.description, backlogLane: row.backlogLane, backlogStatus: row.backlogStatus }),
    id: row.id, backlogRevision: row.backlogRevision, backlogKey: row.backlogKey, order: row.order };
}
