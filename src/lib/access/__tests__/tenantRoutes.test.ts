import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), write: vi.fn(), initiative: vi.fn(), project: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireCurrentUserApi: mocks.auth }));
vi.mock("@/lib/db", () => ({
  establishAuthContext: vi.fn(), currentAuthUserId: () => "auth-a",
  withTransaction: async (fn: () => Promise<unknown>) => fn(),
  db: {
    initiative: { findUnique: mocks.initiative },
    project: { findUnique: mocks.project },
    artifactLayer: { findUnique: async () => ({ prototypeId: "proto-b", prototype: { initiativeId: "init-b" } }), update: mocks.write },
    capability: { findUnique: async () => ({ intakeAnswerSet: { initiative: { id: "init-b" } } }), update: mocks.write },
    inSprintClarification: { findUnique: async () => ({ initiativeId: "init-b" }), findMany: mocks.write },
    demoItem: { findUnique: async () => ({ initiativeId: "init-b" }), findMany: mocks.write, create: mocks.write },
    sprintReview: { findUnique: async () => ({ initiativeId: "init-b" }), findMany: mocks.write },
    productValidation: { findUnique: async () => ({ initiativeId: "init-b" }), findMany: mocks.write },
    releaseReadinessAssessment: { findUnique: async () => ({ initiativeId: "init-b" }), findMany: mocks.write },
    feedbackRecord: { findUnique: async () => ({ initiativeId: "init-b" }), findMany: mocks.write },
    reprioritizationProposal: { findUnique: async () => ({ feedbackId: "feedback-b" }) },
    jiraConnection: { findFirst: async () => null },
    jiraImportRun: { findFirst: async () => null },
    jiraExportRun: { findFirst: async () => null },
    jiraSyncConflict: { findFirst: async () => null },
    prototype: { findUnique: mocks.write },
  },
}));

import { GET as projectGet } from "@/app/api/projects/[id]/route";
import { PATCH as artifactEdit } from "@/app/api/artifacts/[artifactId]/route";
import { POST as capabilityMove } from "@/app/api/capabilities/[capId]/move-phase/route";
import { POST as regenerate } from "@/app/api/initiatives/[id]/generate/route";
import { POST as approve } from "@/app/api/initiatives/[id]/approve-plan/route";
import { GET as requestsGet, POST as requestsSave } from "@/app/api/initiatives/[id]/requests/route";
import { GET as backlogGet, POST as backlogSave } from "@/app/api/initiatives/[id]/backlog/route";
import { POST as storyCreate } from "@/app/api/initiatives/[id]/stories/route";
import { GET as clarificationsGet, POST as clarificationCreate } from "@/app/api/initiatives/[id]/clarifications/route";
import { PATCH as clarificationUpdate } from "@/app/api/clarifications/[clarificationId]/route";
import { GET as demosGet, POST as demoCreate } from "@/app/api/initiatives/[id]/demos/route";
import { PATCH as demoUpdate } from "@/app/api/demos/[demoId]/route";
import { PATCH as demoReorder } from "@/app/api/initiatives/[id]/demos/reorder/route";
import { GET as reviewsGet, POST as reviewCreate } from "@/app/api/initiatives/[id]/sprint-reviews/route";
import { PATCH as reviewUpdate } from "@/app/api/sprint-reviews/[reviewId]/route";
import { GET as validationsGet, POST as validationCreate } from "@/app/api/initiatives/[id]/validations/route";
import { PATCH as validationUpdate } from "@/app/api/validations/[validationId]/route";
import { GET as readinessGet, POST as readinessCreate } from "@/app/api/initiatives/[id]/release-readiness/route";
import { PATCH as readinessUpdate } from "@/app/api/release-readiness/[assessmentId]/route";
import { GET as feedbackGet, POST as feedbackCreate } from "@/app/api/initiatives/[id]/feedback/route";
import { PATCH as feedbackUpdate } from "@/app/api/feedback/[feedbackId]/route";
import { PATCH as proposalUpdate } from "@/app/api/reprioritization-proposals/[proposalId]/route";
import { POST as jiraOAuthStart } from "@/app/api/integrations/jira/oauth/start/route";
import { POST as jiraImportPreview } from "@/app/api/integrations/jira/imports/preview/route";
import { GET as jiraImportGet, PATCH as jiraImportApply } from "@/app/api/integrations/jira/imports/[runId]/route";
import { POST as jiraExportPreview } from "@/app/api/integrations/jira/exports/preview/route";
import { GET as jiraExportGet, PATCH as jiraExportApprove } from "@/app/api/integrations/jira/exports/[runId]/route";
import { POST as jiraExportExecute } from "@/app/api/integrations/jira/exports/[runId]/execute/route";
import { POST as jiraWebhookConfigure } from "@/app/api/integrations/jira/connections/[connectionId]/webhooks/route";
import { PATCH as jiraConflictResolve } from "@/app/api/integrations/jira/conflicts/[conflictId]/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, user: { id: "user-a", authUserId: "auth-a", organizationId: "org-a", status: "active", accessLevel: "org_admin", permissionRole: "owner" } });
  // Deliberately return foreign rows, simulating a DB connection that bypasses
  // RLS: application authorization must still independently reject the IDs.
  mocks.initiative.mockResolvedValue({ id: "init-b", organizationId: "org-b" });
  mocks.project.mockResolvedValue({ organizationId: "org-b" });
});

const request = (method: string, body?: unknown) => new Request("https://app.test/api/test", { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });

describe("cross-organization API authorization independent of RLS", () => {
  it("cannot read or write another organization's PO requests", async () => {
    expect((await requestsGet(request("GET"), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await requestsSave(request("POST", {}), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot read or write another organization's feature backlog", async () => {
    expect((await backlogGet(request("GET"), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await backlogSave(request("POST", {}), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot create a story in another organization's initiative", async () => {
    const response = await storyCreate(request("POST", {
      epicId: "epic-b",
      title: "Injected story",
      body: "As an attacker, I want foreign access, so that I can change another tenant.",
      points: 3,
      sourceType: "manual",
    }), { params: Promise.resolve({ id: "init-b" }) });
    expect(response.status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot read, create, or update in-sprint clarifications in another organization", async () => {
    expect((await clarificationsGet(request("GET"), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await clarificationCreate(request("POST", {}), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await clarificationUpdate(request("PATCH", {}), { params: Promise.resolve({ clarificationId: "clarification-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot read, create, or update demo items in another organization", async () => {
    expect((await demosGet(request("GET"), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await demoCreate(request("POST", {}), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await demoUpdate(request("PATCH", {}), { params: Promise.resolve({ demoId: "demo-b" }) })).status).toBe(404);
    expect((await demoReorder(request("PATCH", {}), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot read, generate, or update sprint reviews in another organization", async () => {
    expect((await reviewsGet(request("GET"), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await reviewCreate(request("POST", {}), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await reviewUpdate(request("PATCH", {}), { params: Promise.resolve({ reviewId: "review-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot read, create, or update Product Owner validations in another organization", async () => {
    expect((await validationsGet(request("GET"), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await validationCreate(request("POST", {}), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await validationUpdate(request("PATCH", {}), { params: Promise.resolve({ validationId: "validation-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot read, create, or update release readiness in another organization", async () => {
    expect((await readinessGet(request("GET"), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await readinessCreate(request("POST", {}), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await readinessUpdate(request("PATCH", {}), { params: Promise.resolve({ assessmentId: "readiness-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot read, create, update, or reprioritize feedback in another organization", async () => {
    expect((await feedbackGet(request("GET"), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await feedbackCreate(request("POST", {}), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect((await feedbackUpdate(request("PATCH", {}), { params: Promise.resolve({ feedbackId: "feedback-b" }) })).status).toBe(404);
    expect((await proposalUpdate(request("PATCH", {}), { params: Promise.resolve({ proposalId: "proposal-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot authorize or import Jira data for another organization", async () => {
    expect((await jiraOAuthStart(request("POST", { initiativeId: "init-b", returnPath: "/integrations/jira" }))).status).toBe(404);
    expect((await jiraImportPreview(request("POST", { connectionId: "jira-b" }))).status).toBe(404);
    expect((await jiraImportGet(request("GET"), { params: Promise.resolve({ runId: "jira-run-b" }) })).status).toBe(404);
    expect((await jiraImportApply(request("PATCH", { expectedStatus: "previewed", selectedItemIds: ["item-b"], reason: "Foreign import attempt" }), { params: Promise.resolve({ runId: "jira-run-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot preview, approve, or execute Jira exports for another organization", async () => {
    expect((await jiraExportPreview(request("POST", { connectionId: "jira-b" }))).status).toBe(404);
    expect((await jiraExportGet(request("GET"), { params: Promise.resolve({ runId: "jira-export-b" }) })).status).toBe(404);
    expect((await jiraExportApprove(request("PATCH", { expectedStatus: "previewed", selectedItemIds: ["item-b"], reason: "Foreign export attempt" }), { params: Promise.resolve({ runId: "jira-export-b" }) })).status).toBe(404);
    expect((await jiraExportExecute(request("POST", { expectedStatus: "approved" }), { params: Promise.resolve({ runId: "jira-export-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot configure webhooks or resolve Jira conflicts for another organization", async () => {
    expect((await jiraWebhookConfigure(request("POST", { action: "register" }), { params: Promise.resolve({ connectionId: "jira-b" }) })).status).toBe(404);
    expect((await jiraConflictResolve(request("PATCH", { resolution: "keep_planning", reason: "Foreign conflict attempt" }), { params: Promise.resolve({ conflictId: "conflict-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("rejects signed-out access to the request workflow", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: Response.json({ error: "Sign in" }, { status: 401 }) });
    expect((await requestsGet(request("GET"), { params: Promise.resolve({ id: "init-a" }) })).status).toBe(401);
    expect((await requestsSave(request("POST", {}), { params: Promise.resolve({ id: "init-a" }) })).status).toBe(401);
  });
  it("cannot read another organization's project", async () => {
    expect((await projectGet(request("GET"), { params: Promise.resolve({ id: "project-b" }) })).status).toBe(404);
  });
  it("cannot edit another organization's artifact", async () => {
    expect((await artifactEdit(request("PATCH", { title: "Injected" }), { params: Promise.resolve({ artifactId: "artifact-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot move another organization's capability", async () => {
    expect((await capabilityMove(request("POST", { targetPhase: 2 }), { params: Promise.resolve({ capId: "cap-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot regenerate another organization's plan", async () => {
    expect((await regenerate(request("POST", {}), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cannot approve another organization's plan", async () => {
    expect((await approve(request("POST", {}), { params: Promise.resolve({ id: "init-b" }) })).status).toBe(404);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
