import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meetings/providers", () => ({ accessTokenFor: vi.fn(async (_org: string, _user: string, provider: string) => `${provider}-token`) }));

import { scheduleProviderMeeting } from "../schedule";

afterEach(() => vi.restoreAllMocks());

describe("meeting scheduling", () => {
  it("sends Zoom's join link to attendees through Google Calendar", async () => {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "12345678901", join_url: "https://zoom.us/j/12345678901?pwd=test" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "calendar-event" }), { status: 200 }));
    const result = await scheduleProviderMeeting("org-a", "user-a", {
      demoId: "demo-1", provider: "zoom", title: "Product demo", purpose: "Review launch",
      startsAt: start.toISOString(), endsAt: end.toISOString(), attendees: [{ name: "Jordan Lee", email: "jordan@example.com" }],
    });
    expect(result.joinUrl).toBe("https://zoom.us/j/12345678901?pwd=test");
    const calendarUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(calendarUrl).toContain("sendUpdates=all");
    const options = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const event = JSON.parse(String(options.body)) as { attendees: { email: string }[]; description: string; location: string };
    expect(event.attendees).toEqual([{ email: "jordan@example.com", displayName: "Jordan Lee" }]);
    expect(event.description).toContain(result.joinUrl);
    expect(event.location).toBe(result.joinUrl);
  });
});
