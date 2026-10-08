import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db } from "@/lib/db";
import { withPlanningMutation } from "@/lib/generation/mutation";
import { priorityScore, requestSchema } from "@/lib/requests/model";
import { featureRecord } from "./model";
import { listFeatures } from "./service";
import { latestPriorityDecisionMap } from "@/lib/prioritization/service";
import type { PriorityFactors } from "@/lib/prioritization/model";

export const backlogItemTypes = ["request", "feature", "story"] as const;
export const bulkTriageCommand = z.object({
  action: z.enum(["archive", "restore", "set_lane"]),
  lane: z.enum(["now", "next", "later", "unscheduled"]).optional(),
  reason: z.string().trim().min(3).max(500),
  items: z.array(z.object({
    id: z.string().min(1), type: z.enum(backlogItemTypes), revision: z.number().int().positive(),
  }).strict()).min(1).max(100),
}).strict().superRefine((value, context) => {
  if (value.action === "set_lane" && !value.lane) context.addIssue({ code: "custom", path: ["lane"], message: "Choose a roadmap placement." });
});

export type BacklogItemRecord = {
  id: string;
  key: string | null;
  recordType: typeof backlogItemTypes[number];
  workType: string;
  title: string;
  description: string;
  source: string;
  owner: { id: string; name: string; email: string } | null;
  status: string;
  readiness: string;
  priorityLabel: string;
  priorityScore: number | null;
  priorityFactors: PriorityFactors;
  dependencyAdjustedScore: number | null;
  priorityReason: string;
  priorityDecisionId: string | null;
  prioritySource: "manual" | "ai" | "derived";
  roadmapLane: "now" | "next" | "later" | "unscheduled";
  archived: boolean;
  revision: number;
  sourceFeatureId: string | null;
};

const valueScores: Record<string, number> = { very_low: 20, low: 40, medium: 60, high: 80, critical: 100 };
const valueRatings: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, critical: 5 };
const riskRatings: Record<string, number> = { low: 1, medium: 3, high: 4, critical: 5 };
const effortPointsBySize: Record<string, 1 | 2 | 3 | 5 | 8 | 13> = { xs: 1, s: 2, m: 5, l: 8, xl: 13 };
const effortRatingBySize: Record<string, number> = { xs: 1, s: 2, m: 3, l: 4, xl: 5 };

export async function listUnifiedBacklog(initiativeId: string): Promise<BacklogItemRecord[]> {
  const [features, requests, stories, priorityDecisions] = await Promise.all([
    listFeatures(initiativeId),
    db.planningRequest.findMany({ where: { initiativeId, capabilityId: null }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] }),
    db.artifactLayer.findMany({
      where: { type: "story", readinessStatus: { not: "split" }, prototype: { initiativeId } },
      include: { sourceCapability: { include: { owner: { select: { id: true, name: true, email: true } } } } },
      orderBy: [{ order: "asc" }, { id: "asc" }],
    }),
    latestPriorityDecisionMap(initiativeId),
  ]);

  const featureItems = features.map(row => {
    const feature = featureRecord(row);
    const origin = feature.sourceRequests[0];
    const originData = row.sourceRequests[0] ? requestSchema.safeParse(row.sourceRequests[0].data) : null;
    return {
      id: feature.id, key: feature.backlogKey, recordType: "feature" as const,
      workType: origin && ["bug", "defect"].includes(origin.kind) ? origin.kind : "feature",
      title: feature.name, description: feature.description, source: origin?.source ?? "manual",
      owner: feature.owner, status: feature.backlogStatus, readiness: feature.backlogStatus,
      priorityLabel: originData?.success ? originData.data.priority.moscow : feature.businessValue,
      priorityScore: originData?.success ? priorityScore(originData.data.priority) : valueScores[feature.businessValue] ?? null,
      priorityFactors: originData?.success ? {
        businessValue: originData.data.priority.businessValue, urgency: originData.data.priority.urgency,
        userImpact: originData.data.priority.userNeed, dependencyImpact: originData.data.priority.dependencyImpact,
        risk: originData.data.priority.risk, effort: originData.data.priority.effort,
        effortPoints: originData.data.priority.effortPoints, bugSeverity: originData.data.priority.bugSeverity,
      } : {
        businessValue: valueRatings[feature.businessValue] ?? 3, urgency: 3, userImpact: 3, dependencyImpact: 3,
        risk: riskRatings[feature.riskLevel] ?? 3, effort: effortRatingBySize[row.effortSize] ?? 3,
        effortPoints: effortPointsBySize[row.effortSize] ?? 5, bugSeverity: "not_applicable",
      },
      roadmapLane: feature.backlogLane, archived: feature.backlogStatus === "archived",
      revision: feature.backlogRevision, sourceFeatureId: feature.id,
    };
  });

  const requestItems = requests.flatMap(row => {
    const parsed = requestSchema.safeParse(row.data);
    if (!parsed.success) return [];
    const request = parsed.data;
    return [{
      id: row.id, key: null, recordType: "request" as const, workType: request.kind,
      title: request.title, description: request.problem || request.requestedChange, source: request.source,
      owner: null, status: request.status, readiness: request.readiness,
      priorityLabel: request.priority.moscow, priorityScore: priorityScore(request.priority),
      priorityFactors: {
        businessValue: request.priority.businessValue, urgency: request.priority.urgency,
        userImpact: request.priority.userNeed, dependencyImpact: request.priority.dependencyImpact,
        risk: request.priority.risk, effort: request.priority.effort,
        effortPoints: request.priority.effortPoints, bugSeverity: request.priority.bugSeverity,
      },
      roadmapLane: request.priority.decision === "untriaged" ? "unscheduled" as const : request.priority.decision,
      archived: Boolean(row.archivedAt), revision: row.revision, sourceFeatureId: null,
    }];
  });

  const storyItems = stories.map(row => {
    const capability = row.sourceCapability;
    return {
      id: row.id, key: row.externalRef, recordType: "story" as const, workType: "story",
      title: row.title, description: row.body, source: row.sourceType, owner: capability?.owner ?? null,
      status: row.readinessStatus, readiness: row.readinessStatus,
      priorityLabel: capability?.businessValue ?? "unscored",
      priorityScore: capability ? valueScores[capability.businessValue] ?? null : null,
      priorityFactors: {
        businessValue: capability ? valueRatings[capability.businessValue] ?? 3 : 3,
        urgency: 3, userImpact: 3, dependencyImpact: 3,
        risk: capability ? riskRatings[capability.riskLevel] ?? 3 : 3,
        effort: capability ? effortRatingBySize[capability.effortSize] ?? 3 : 3,
        effortPoints: capability ? effortPointsBySize[capability.effortSize] ?? 5 : 5,
        bugSeverity: "not_applicable",
      },
      roadmapLane: capability && ["now", "next", "later", "unscheduled"].includes(capability.backlogLane)
        ? capability.backlogLane as BacklogItemRecord["roadmapLane"] : "unscheduled" as const,
      archived: Boolean(row.archivedAt), revision: row.backlogRevision, sourceFeatureId: capability?.id ?? null,
    };
  });

  const resolved = [...featureItems, ...requestItems, ...storyItems].map(item => {
    const decision = priorityDecisions.get(`${item.recordType}:${item.id}`);
    return decision ? {
      ...item,
      priorityLabel: decision.moscow,
      priorityScore: decision.score,
      priorityFactors: decision.factors,
      dependencyAdjustedScore: decision.dependencyAdjustedScore,
      priorityReason: decision.reason,
      priorityDecisionId: decision.id,
      prioritySource: decision.source,
      roadmapLane: decision.roadmapLane,
    } : {
      ...item,
      dependencyAdjustedScore: item.priorityScore,
      priorityReason: "",
      priorityDecisionId: null,
      prioritySource: "derived" as const,
    };
  });
  return resolved.sort((a, b) =>
    Number(a.archived) - Number(b.archived) ||
    (b.dependencyAdjustedScore ?? -1) - (a.dependencyAdjustedScore ?? -1) ||
    (b.priorityScore ?? -1) - (a.priorityScore ?? -1) ||
    a.title.localeCompare(b.title)
  );
}

export async function bulkTriageBacklog(
  initiativeId: string,
  commandInput: z.infer<typeof bulkTriageCommand>,
) {
  const command = bulkTriageCommand.parse(commandInput);
  return withPlanningMutation(initiativeId, "backlog.bulk_triaged", async () => {
    const plan = await db.prototype.findUnique({ where: { initiativeId }, select: { approvedAt: true } });
    if (plan?.approvedAt) throw new BusinessError("Reopen the approved plan before changing its backlog.");
    const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true } });
    if (!initiative) throw new BusinessError("Initiative not found.", 404);

    for (const item of command.items) {
      if (item.type === "feature") {
        const row = await db.capability.findFirst({ where: { id: item.id, intakeAnswerSet: { initiativeId } } });
        if (!row) throw new BusinessError("A selected feature was not found.", 404);
        if (row.backlogRevision !== item.revision) throw new BusinessError("A selected feature changed. Reload before applying bulk triage.", 409);
        const data: Prisma.CapabilityUpdateInput = { backlogRevision: { increment: 1 } };
        if (command.action === "set_lane") data.backlogLane = command.lane!;
        else data.backlogStatus = command.action === "archive" ? "archived" : "planned";
        const saved = await db.capability.update({ where: { id: row.id, backlogRevision: item.revision }, data });
        await auditInitiative(initiativeId, command.action === "archive" ? "backlog.feature_archived" : "backlog.feature_updated", {
          capabilityId: row.id, revision: saved.backlogRevision, reason: command.reason,
          changes: command.action === "set_lane"
            ? { backlogLane: { before: row.backlogLane, after: command.lane! } }
            : { backlogStatus: { before: row.backlogStatus, after: data.backlogStatus as string } },
        });
      } else if (item.type === "request") {
        const row = await db.planningRequest.findFirst({ where: { id: item.id, initiativeId } });
        if (!row) throw new BusinessError("A selected request was not found.", 404);
        if (row.revision !== item.revision) throw new BusinessError("A selected request changed. Reload before applying bulk triage.", 409);
        if (command.action === "set_lane") {
          const request = requestSchema.parse(row.data);
          const next = requestSchema.parse({ ...request, priority: {
            ...request.priority, decision: command.lane === "unscheduled" ? "untriaged" : command.lane,
            reason: command.reason,
          } });
          await db.planningRequest.update({ where: { id: row.id, revision: item.revision }, data: {
            data: next as Prisma.InputJsonObject, revision: { increment: 1 },
          } });
        } else {
          await db.planningRequest.update({ where: { id: row.id, revision: item.revision }, data: {
            archivedAt: command.action === "archive" ? new Date() : null, revision: { increment: 1 },
          } });
        }
      } else {
        if (command.action === "set_lane") throw new BusinessError("Stories inherit roadmap placement from their feature. Remove stories from this bulk placement change.");
        const row = await db.artifactLayer.findFirst({ where: { id: item.id, type: "story", prototype: { initiativeId } } });
        if (!row) throw new BusinessError("A selected story was not found.", 404);
        if (row.backlogRevision !== item.revision) throw new BusinessError("A selected story changed. Reload before applying bulk triage.", 409);
        await db.artifactLayer.update({ where: { id: row.id, backlogRevision: item.revision }, data: {
          archivedAt: command.action === "archive" ? new Date() : null, backlogRevision: { increment: 1 },
        } });
      }
    }

    await auditInitiative(initiativeId, "backlog.bulk_triaged", {
      action: command.action, lane: command.lane ?? "", reason: command.reason,
      items: command.items.map(item => ({ id: item.id, type: item.type })),
    });
    return listUnifiedBacklog(initiativeId);
  }, true);
}
