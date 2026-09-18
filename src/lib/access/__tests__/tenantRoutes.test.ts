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
