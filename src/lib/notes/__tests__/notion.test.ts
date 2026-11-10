import { describe, expect, it } from "vitest";
import { notionPageId } from "../notion";

describe("Notion page import input", () => {
  it("extracts a page id from a shared Notion URL", () => {
    expect(notionPageId("https://www.notion.so/Workspace/Meeting-notes-1234567890abcdef1234567890abcdef?pvs=4")).toBe("1234567890abcdef1234567890abcdef");
  });
  it("rejects arbitrary hosts before making an API request", () => {
    expect(() => notionPageId("https://evil.example/1234567890abcdef1234567890abcdef")).toThrow();
  });
});
