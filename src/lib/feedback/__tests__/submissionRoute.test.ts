import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ signedIn: true, allowed: true, create: vi.fn(), context: vi.fn() }));
vi.mock("@/lib/observability", () => ({ withApi: (fn: unknown) => fn }));
vi.mock("@/lib/auth/session", () => ({ requireCurrentUserApi: async () => state.signedIn
  ? { ok: true, user: { id: "external-a", authUserId: "auth-a", organizationId: "org-a" } }
  : { ok: false, response: Response.json({ error: "Not signed in." }, { status: 401 }) } }));
vi.mock("@/lib/db", () => ({ establishAuthContext: state.context }));
vi.mock("@/lib/access/actionGuard", async () => {
  const { BusinessError } = await import("@/lib/businessError");
  return { requireCollaborationAction: async () => { if (!state.allowed) throw new BusinessError("Not authorized.", 403); } };
});
vi.mock("@/lib/feedback/service", () => ({ createFeedback: state.create }));
import { POST } from "@/app/api/initiatives/[id]/feedback/submissions/route";
const send = (body: unknown) => POST(new Request("https://clarivia.test/api/initiatives/init-a/feedback/submissions", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: "init-a" }) });
beforeEach(() => {
  state.signedIn = true; state.allowed = true; state.create.mockReset(); state.context.mockClear();
  state.create.mockResolvedValue({ feedback: { id: "receipt-a", organizationId: "org-a", summary: "Internal triage" }, suggestions: ["private AI"], priorityContext: { priority: 99 } });
});
describe("narrow stakeholder feedback submission", () => {
  it("stamps trusted source and actor and exposes only a receipt", async () => {
    const response = await send({ title: "Reporting usability", details: "The report is difficult to locate." });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ receipt: { id: "receipt-a", status: "received" } });
    expect(state.create).toHaveBeenCalledWith("init-a", expect.objectContaining({ source: "stakeholder", sourceReference: "submission:external-a", category: "general" }), "external-a");
  });
  it("rejects client authority, source, workspace, and initial-status fields", async () => {
    const response = await send({ title: "Feedback title", details: "Feedback details", organizationId: "forged", source: "jira", status: "actioned", createdByUserId: "owner" });
    expect(response.status).toBe(422); expect(state.create).not.toHaveBeenCalled();
  });
  it("rejects missing identity and unauthorized initiatives before capture", async () => {
    state.signedIn = false;
    expect((await send({})).status).toBe(401);
    state.signedIn = true; state.allowed = false;
    expect((await send({})).status).toBe(403);
    expect(state.create).not.toHaveBeenCalled();
  });
});
