import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JiraExternalLink } from "@prisma/client";

const mocks = vi.hoisted(() => ({ findLink: vi.fn(), updateLink: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { jiraExternalLink: { findFirst: mocks.findLink, updateMany: mocks.updateLink } } }));
vi.mock("../oauth", () => ({ accessTokenFor: vi.fn() }));
vi.mock("../client", () => ({ getJiraIssue: vi.fn() }));

import { applyJiraDeliverySnapshot, mappedJiraDeliveryStatus } from "../delivery";

const issue = {
  id: "10001", key: "ABC-12", projectId: "200", projectKey: "ABC",
  status: { id: "3", name: "In Progress", category: "indeterminate" },
  priority: { id: "2", name: "High" }, labels: ["delivery"], parentKey: "ABC-1",
  updated: "2026-11-11T12:00:00.000Z",
};
const link = {
  id: "link-1", externalKey: "ABC-12", deliveryStatusId: null, deliveryStatusName: null,
  deliveryStatusCategory: null, deliveryMappedStatus: null, deliveryPriorityId: null,
  deliveryPriorityName: null, deliveryLabels: [], deliveryParentKey: null,
  deliverySourceUpdatedAt: null, deliveryRevision: 0,
} as unknown as JiraExternalLink;

describe("Jira delivery mirror", () => {
  beforeEach(() => { mocks.findLink.mockReset().mockResolvedValue(link); mocks.updateLink.mockReset().mockResolvedValue({ count: 1 }); });

  it("uses the project's status mapping, then Jira's status category", () => {
    expect(mappedJiraDeliveryStatus(issue, { statusMappings: { "3": "blocked" } })).toBe("blocked");
    expect(mappedJiraDeliveryStatus(issue, {})).toBe("in_progress");
    expect(mappedJiraDeliveryStatus({ ...issue, status: { id: "4", name: "Done", category: "done" } }, {})).toBe("done");
  });

  it("updates only Jira-owned execution fields and preserves PO decisions", async () => {
    expect(await applyJiraDeliverySnapshot("connection-1", issue, "200", "ABC", {})).toEqual({ updated: true, reason: "updated" });
    const data = mocks.updateLink.mock.calls[0][0].data;
    expect(data).toMatchObject({ deliveryMappedStatus: "in_progress", deliveryStatusName: "In Progress", deliveryPriorityName: "High", deliveryLabels: ["delivery"], deliveryRevision: { increment: 1 } });
    expect(data).not.toHaveProperty("targetFingerprint");
    expect(data).not.toHaveProperty("sourceHash");
    expect(data).not.toHaveProperty("lastImportedSnapshot");
    expect(data).not.toHaveProperty("backlogStatus");
  });

  it("ignores an older source observation", async () => {
    mocks.findLink.mockResolvedValue({ ...link, deliverySourceUpdatedAt: new Date("2026-11-11T13:00:00.000Z") });
    expect(await applyJiraDeliverySnapshot("connection-1", issue, "200", "ABC", {})).toEqual({ updated: false, reason: "older" });
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("records a successful check without changing the delivery revision", async () => {
    mocks.findLink.mockResolvedValue({ ...link, deliveryStatusId: "3", deliveryStatusName: "In Progress", deliveryStatusCategory: "indeterminate", deliveryMappedStatus: "in_progress", deliveryPriorityId: "2", deliveryPriorityName: "High", deliveryLabels: ["delivery"], deliveryParentKey: "ABC-1", deliverySourceUpdatedAt: new Date(issue.updated) });
    expect(await applyJiraDeliverySnapshot("connection-1", issue, "200", "ABC", {})).toEqual({ updated: false, reason: "unchanged" });
    expect(mocks.updateLink).toHaveBeenCalledWith(expect.objectContaining({ data: { deliveryCheckedAt: expect.any(Date) } }));
  });

  it("rejects an issue moved to another Jira project", async () => {
    await expect(applyJiraDeliverySnapshot("connection-1", issue, "999", "OTHER", {})).rejects.toThrow("moved to another project");
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });
});
