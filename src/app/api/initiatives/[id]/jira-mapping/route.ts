import { NextResponse } from "next/server";
import { z } from "zod";
import { auditInitiative } from "@/lib/audit";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { withApi } from "@/lib/observability";

const fieldSchema = z.object({
  localEntityType: z.enum(["epic", "story"]),
  localField: z.enum(["title", "description", "points"]),
  jiraFieldId: z.string().trim().min(1).max(200),
  jiraFieldName: z.string().trim().min(1).max(255),
  direction: z.enum(["planner_to_jira", "jira_to_planner", "bidirectional"]),
  conflictOwner: z.enum(["planner", "jira", "require_review"]),
}).strict();

const mappingSchema = z.object({
  installationId: z.string().trim().min(1).max(191),
  project: z.object({
    id: z.string().regex(/^\d{1,20}$/),
    key: z.string().regex(/^[A-Z][A-Z0-9_]{1,19}$/),
    name: z.string().trim().min(1).max(255),
  }).strict(),
  issueTypes: z.array(z.object({
    localType: z.enum(["epic", "story"]),
    jiraIssueTypeId: z.string().trim().min(1).max(64),
    jiraIssueTypeName: z.string().trim().min(1).max(255),
  }).strict()).length(2),
  fields: z.array(fieldSchema).max(40),
  statuses: z.array(z.object({
    jiraStatusId: z.string().trim().min(1).max(64),
    jiraStatusName: z.string().trim().min(1).max(255),
    localStatus: z.enum(["todo", "in_progress", "done", "blocked"]),
  }).strict()).max(100),
}).strict().superRefine((data, context) => {
  const issueTypes = new Set(data.issueTypes.map((entry) => entry.localType));
  if (!issueTypes.has("epic") || !issueTypes.has("story")) {
    context.addIssue({ code: "custom", path: ["issueTypes"], message: "Map both epics and stories to Jira issue types." });
  }
  if (new Set(data.issueTypes.map((entry) => entry.jiraIssueTypeId)).size !== data.issueTypes.length) {
    context.addIssue({ code: "custom", path: ["issueTypes"], message: "Each local type needs a different Jira issue type." });
  }
  if (new Set(data.fields.map((entry) => `${entry.localEntityType}:${entry.localField}`)).size !== data.fields.length) {
    context.addIssue({ code: "custom", path: ["fields"], message: "A local field can only be mapped once." });
  }
  if (new Set(data.fields.map((entry) => entry.jiraFieldId)).size !== data.fields.length) {
    context.addIssue({ code: "custom", path: ["fields"], message: "A Jira field can only be mapped once." });
  }
  if (new Set(data.statuses.map((entry) => entry.jiraStatusId)).size !== data.statuses.length) {
    context.addIssue({ code: "custom", path: ["statuses"], message: "A Jira status can only be mapped once." });
  }
  for (const field of data.fields) {
    if (field.direction === "planner_to_jira" && field.conflictOwner !== "planner") {
      context.addIssue({ code: "custom", path: ["fields"], message: "Planner-owned fields must use planner-to-Jira direction." });
    }
    if (field.direction === "jira_to_planner" && field.conflictOwner !== "jira") {
      context.addIssue({ code: "custom", path: ["fields"], message: "Jira-owned fields must use Jira-to-planner direction." });
    }
  }
});

async function GETHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const actor = authGuard.user;
  if (!actor.authUserId) return jsonError("Your authenticated account is not fully provisioned.", 409);
  establishAuthContext(actor.authUserId);
  const guard = await requireInitiativeApiAccess(actor, id, "view");
  if (!guard.ok) return guard.response;

  const [installations, binding] = await Promise.all([
    db.atlassianInstallation.findMany({
      where: { organizationId: actor.organizationId, status: "active" },
      select: { id: true, cloudId: true, status: true },
      orderBy: { installedAt: "desc" },
    }),
    db.jiraProjectBinding.findFirst({
      where: { initiativeId: id, organizationId: actor.organizationId },
      include: { issueTypeMappings: true, fieldMappings: true, statusMappings: true },
    }),
  ]);
  return NextResponse.json({ installations, mapping: binding });
}

async function PUTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const actor = authGuard.user;
  if (!actor.authUserId) return jsonError("Your authenticated account is not fully provisioned.", 409);
  establishAuthContext(actor.authUserId);
  const roleGuard = requireOrganizationRole(actor, ["owner", "admin"]);
  if (!roleGuard.ok) return roleGuard.response;
  const guard = await requireInitiativeApiAccess(actor, id, "edit");
  if (!guard.ok) return guard.response;
  const parsed = mappingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const input = parsed.data;

  const installation = await db.atlassianInstallation.findFirst({
    where: { id: input.installationId, organizationId: actor.organizationId, status: "active" },
    select: { id: true },
  });
  if (!installation) return jsonError("Connect a Jira site to this organization before mapping a project.", 409);

  const binding = await withTransaction(async (tx) => {
    const saved = await tx.jiraProjectBinding.upsert({
      where: { initiativeId_installationId: { initiativeId: id, installationId: installation.id } },
      create: {
        organizationId: actor.organizationId,
        initiativeId: id,
        installationId: installation.id,
        jiraProjectId: input.project.id,
        jiraProjectKey: input.project.key,
        jiraProjectName: input.project.name,
      },
      update: {
        jiraProjectId: input.project.id,
        jiraProjectKey: input.project.key,
        jiraProjectName: input.project.name,
        enabled: true,
      },
      select: { id: true },
    });
    await tx.jiraIssueTypeMapping.deleteMany({ where: { projectBindingId: saved.id } });
    await tx.jiraFieldMapping.deleteMany({ where: { projectBindingId: saved.id } });
    await tx.jiraStatusMapping.deleteMany({ where: { projectBindingId: saved.id } });
    await tx.jiraIssueTypeMapping.createMany({ data: input.issueTypes.map((item) => ({ projectBindingId: saved.id, ...item })) });
    if (input.fields.length) await tx.jiraFieldMapping.createMany({ data: input.fields.map((item) => ({ projectBindingId: saved.id, ...item })) });
    if (input.statuses.length) await tx.jiraStatusMapping.createMany({ data: input.statuses.map((item) => ({ projectBindingId: saved.id, ...item })) });
    await auditInitiative(id, "jira.mapping.updated", {
      projectKey: input.project.key,
      issueTypeMappings: input.issueTypes.length,
      fieldMappings: input.fields.length,
      statusMappings: input.statuses.length,
    });
    return tx.jiraProjectBinding.findUniqueOrThrow({
      where: { id: saved.id },
      include: { issueTypeMappings: true, fieldMappings: true, statusMappings: true },
    });
  });
  return NextResponse.json({ mapping: binding });
}

export const GET = withApi(GETHandler);
export const PUT = withApi(PUTHandler);
