import { describe, expect, it } from "vitest";
import { createReleaseSchema } from "../schemas";

describe("release planning input", () => {
  it("captures cadence and target release date without asking for a phase or release name", () => {
    const result = createReleaseSchema.parse({ cadence: "monthly", targetDate: "2026-12-01" });
    expect(result.cadence).toBe("monthly");
    expect(result.targetDate).toBeInstanceOf(Date);
    expect(result).not.toHaveProperty("phaseNumber");
    expect(result).not.toHaveProperty("name");
  });

  it("requires a description for a custom cadence", () => {
    expect(createReleaseSchema.safeParse({ cadence: "custom", customCadence: "", targetDate: "2026-12-01" }).success).toBe(false);
    expect(createReleaseSchema.safeParse({ cadence: "custom", customCadence: "Every six weeks", targetDate: "2026-12-01" }).success).toBe(true);
  });
});
