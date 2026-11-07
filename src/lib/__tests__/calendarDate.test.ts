import { describe, expect, it } from "vitest";
import { formatCalendarDate } from "../calendarDate";

describe("calendar dates", () => {
  it("preserves the day selected for a release and sprint across local timezones", () => {
    expect(formatCalendarDate(new Date("2026-01-01T00:00:00.000Z"), {
      month: "short", day: "numeric", year: "numeric",
    })).toBe("Jan 1, 2026");
    expect(formatCalendarDate(new Date("2026-11-02T00:00:00.000Z"), {
      month: "short", day: "numeric",
    })).toBe("Nov 2");
  });
});
