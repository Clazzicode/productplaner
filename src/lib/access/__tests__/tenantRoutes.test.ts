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
