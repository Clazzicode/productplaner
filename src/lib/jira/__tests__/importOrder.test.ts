import { describe, expect, it } from "vitest";
import { orderImportItems } from "../import";

describe("Jira import application order", () => {
  it("creates parent features before stories regardless of preview order", () => {
    const items = [
      { externalKey: "SCRUM-8", targetType: "story" },
      { externalKey: "SCRUM-2", targetType: "feature" },
      { externalKey: "SCRUM-9", targetType: "bug" },
      { externalKey: "SCRUM-1", targetType: "feature" },
    ];
    expect(orderImportItems(items).map((item) => item.externalKey)).toEqual(["SCRUM-1", "SCRUM-2", "SCRUM-8", "SCRUM-9"]);
    expect(items[0].externalKey).toBe("SCRUM-8");
  });
});
