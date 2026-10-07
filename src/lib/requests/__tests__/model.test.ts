import { describe, expect, it, vi, afterEach } from "vitest";
import { emptyRequest, priorityScore, requestSchema, requirementGaps, toRequestInput } from "../model";
import { demoRequests, poDemoEnabled } from "../demo";

afterEach(() => vi.unstubAllEnvs());
describe("PO intake, requirements and priority", () => {
  it("accepts partial intake but cannot mark unanswered requirements ready", () => {
    const input = { ...emptyRequest(), title: "Saved maps", requestor: "PO" };
    expect(requestSchema.safeParse(input).success).toBe(true);
    expect(requestSchema.safeParse({ ...input, status: "ready" }).success).toBe(false);
    expect(requirementGaps(input)).toContain("Describe the problem being solved.");
    expect(requirementGaps(input).length).toBeGreaterThan(3);
  });
  it("requires an answer and owner for each clarification", () => {
    const sample = demoRequests()[0];
    const input = { ...demoRequests()[1],
      title: sample.title, requestor: sample.requestor, problem: sample.problem, requestedChange: sample.requestedChange,
      outcome: sample.outcome, questions: sample.questions, status: "ready" as const };
    const request = toRequestInput(input);
    expect(requestSchema.safeParse(request).success).toBe(false);
    expect(requestSchema.safeParse({ ...request, questions: [{ ...sample.questions[0], answer: "Ten saved views" }] }).success).toBe(true);
    expect(requestSchema.safeParse({ ...request, questions: [{ ...sample.questions[0], owner: "", answer: "Ten" }] }).success).toBe(false);
  });
  it("requires an explicit reason for overriding or accepting the score", () => {
    const input = { ...emptyRequest(), title: "Request", requestor: "PO" };
    expect(requestSchema.safeParse({ ...input, priority: { ...input.priority, decision: "now" } }).success).toBe(false);
    expect(requestSchema.safeParse({ ...input, priority: { ...input.priority, decision: "now", reason: "Customer deadline" } }).success).toBe(true);
  });
  it("has bounded explainable scores and penalizes risk and effort", () => {
    const p = emptyRequest().priority;
    expect(priorityScore(p)).toBe(50);
    expect(priorityScore({ ...p, businessValue: 5, urgency: 5, userNeed: 5, dependencyImpact: 5, risk: 1, effort: 1 })).toBe(100);
    expect(priorityScore({ ...p, businessValue: 1, urgency: 1, userNeed: 1, dependencyImpact: 1, risk: 5, effort: 5 })).toBe(0);
    expect(priorityScore({ ...p, risk: 5 })).toBeLessThan(priorityScore(p));
    expect(priorityScore({ ...p, effort: 5 })).toBeLessThan(priorityScore(p));
  });
  it("rejects untrusted identity fields and out-of-range ratings", () => {
    const input = { ...emptyRequest(), title: "Request", requestor: "PO" };
    expect(requestSchema.safeParse({ ...input, organizationId: "other-org" }).success).toBe(false);
    expect(requestSchema.safeParse({ ...input, priority: { ...input.priority, urgency: 20 } }).success).toBe(false);
  });
  it("keeps imported bugs traceable and requires the core bug details", () => {
    const base = { ...emptyRequest(), title: "Checkout fails", requestor: "Support", kind: "bug" as const,
      source: "jira" as const, sourceReference: "PAY-42" };
    expect(requestSchema.safeParse(base).success).toBe(false);
    const complete = { ...base, bug: { ...base.bug, affectedArea: "Checkout", observedBehavior: "Payment returns 500", expectedBehavior: "Payment succeeds" } };
    expect(requestSchema.safeParse(complete).success).toBe(true);
    expect(requestSchema.safeParse({ ...complete, sourceReference: "" }).success).toBe(false);
  });
  it("requires the original notes for meeting-sourced requests", () => {
    const base = { ...emptyRequest(), title: "Release cadence", requestor: "Tiana", source: "meeting" as const, sourceReference: "PO review" };
    expect(requestSchema.safeParse(base).success).toBe(false);
    expect(requestSchema.safeParse({ ...base, meetingNotes: "Use monthly releases and show them on the roadmap." }).success).toBe(true);
  });
  it("stores MoSCoW separately from roadmap placement", () => {
    const input = { ...emptyRequest(), title: "Request", requestor: "PO",
      priority: { ...emptyRequest().priority, moscow: "must" as const, decision: "later" as const, reason: "Required, but blocked by a dependency" } };
    const parsed = requestSchema.parse(input);
    expect(parsed.priority.moscow).toBe("must");
    expect(parsed.priority.decision).toBe("later");
  });
  it("cannot enable the sample demo in production even with the flag", () => {
    vi.stubEnv("PO_DEMO_ENABLED", "true"); vi.stubEnv("NODE_ENV", "production");
    expect(poDemoEnabled()).toBe(false);
    vi.stubEnv("NODE_ENV", "development"); expect(poDemoEnabled()).toBe(true);
    vi.stubEnv("PO_DEMO_ENABLED", "false"); expect(poDemoEnabled()).toBe(false);
  });
});
