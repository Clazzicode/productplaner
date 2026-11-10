import { describe, expect, it } from "vitest";
import { notionEvidenceLink } from "../notionLink";

describe("notionEvidenceLink", () => {
  it("uses an existing HTTPS Notion evidence link", () => {
    expect(notionEvidenceLink(["https://example.com/spec", "https://acme.notion.site/Demo-notes-123"])).toBe("https://acme.notion.site/Demo-notes-123");
  });

  it("does not label unrelated or unsafe evidence as a Notion page", () => {
    expect(notionEvidenceLink(["https://notion.so.evil.example/page", "javascript:alert(1)", "http://notion.so/page"])).toBeNull();
    expect(notionEvidenceLink(null)).toBeNull();
  });
});
