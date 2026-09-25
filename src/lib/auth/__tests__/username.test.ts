import { describe, expect, it } from "vitest";
import { usernameSchema, usernameToPlaceholderEmail } from "../username";

describe("usernameSchema", () => {
  it("accepts letters, numbers, dots, underscores, and hyphens", () => {
    expect(usernameSchema.safeParse("j.smith-99_x").success).toBe(true);
  });

  it("rejects usernames shorter than 3 characters", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects usernames longer than 30 characters", () => {
    expect(usernameSchema.safeParse("a".repeat(31)).success).toBe(false);
  });

  it("rejects disallowed characters (spaces, @, etc.)", () => {
    expect(usernameSchema.safeParse("john smith").success).toBe(false);
    expect(usernameSchema.safeParse("john@smith").success).toBe(false);
  });

  it("trims surrounding whitespace before validating", () => {
    const result = usernameSchema.safeParse("  jsmith  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("jsmith");
  });
});

describe("usernameToPlaceholderEmail", () => {
  it("builds a deterministic, non-routable placeholder address", () => {
    expect(usernameToPlaceholderEmail("jsmith")).toBe("jsmith@local.invalid");
  });

  it("lowercases the username so case doesn't create distinct accounts", () => {
    expect(usernameToPlaceholderEmail("JSmith")).toBe(usernameToPlaceholderEmail("jsmith"));
  });

  it("trims surrounding whitespace", () => {
    expect(usernameToPlaceholderEmail("  jsmith  ")).toBe("jsmith@local.invalid");
  });
});
