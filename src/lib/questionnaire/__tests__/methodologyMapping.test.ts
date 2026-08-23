import { describe, expect, it } from "vitest";
import { mapMethodologyAnswer } from "@/lib/questionnaire/methodologyMapping";

describe("mapMethodologyAnswer", () => {
  it("passes through the four real methodologies unchanged", () => {
    expect(mapMethodologyAnswer("hybrid")).toBe("hybrid");
    expect(mapMethodologyAnswer("agile_scrum")).toBe("agile_scrum");
    expect(mapMethodologyAnswer("waterfall")).toBe("waterfall");
    expect(mapMethodologyAnswer("kanban")).toBe("kanban");
  });

  it("maps 'not sure' to the documented hybrid fallback", () => {
    expect(mapMethodologyAnswer("not_sure")).toBe("hybrid");
  });
});
