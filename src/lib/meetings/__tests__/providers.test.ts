import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { authorizationUrl, decryptTokens, encryptTokens } from "../providers";

const original = {
  key: process.env.MEETING_TOKEN_ENCRYPTION_KEY,
  googleId: process.env.GOOGLE_MEETING_CLIENT_ID,
  googleSecret: process.env.GOOGLE_MEETING_CLIENT_SECRET,
  googleRedirect: process.env.GOOGLE_MEETING_REDIRECT_URI,
  zoomId: process.env.ZOOM_MEETING_CLIENT_ID,
  zoomSecret: process.env.ZOOM_MEETING_CLIENT_SECRET,
  zoomRedirect: process.env.ZOOM_MEETING_REDIRECT_URI,
};
afterEach(() => {
  process.env.MEETING_TOKEN_ENCRYPTION_KEY = original.key;
  process.env.GOOGLE_MEETING_CLIENT_ID = original.googleId;
  process.env.GOOGLE_MEETING_CLIENT_SECRET = original.googleSecret;
  process.env.GOOGLE_MEETING_REDIRECT_URI = original.googleRedirect;
  process.env.ZOOM_MEETING_CLIENT_ID = original.zoomId;
  process.env.ZOOM_MEETING_CLIENT_SECRET = original.zoomSecret;
  process.env.ZOOM_MEETING_REDIRECT_URI = original.zoomRedirect;
});

describe("meeting provider OAuth", () => {
  it("binds encrypted credentials to workspace, user, and provider", () => {
    process.env.MEETING_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
    const tokens = { accessToken: "access-secret", refreshToken: "refresh-secret" };
    const envelope = encryptTokens("org-a", "user-a", "zoom", tokens);
    expect(envelope).not.toContain(tokens.accessToken);
    expect(decryptTokens("org-a", "user-a", "zoom", envelope)).toEqual(tokens);
    expect(() => decryptTokens("org-b", "user-a", "zoom", envelope)).toThrow();
    expect(() => decryptTokens("org-a", "user-b", "zoom", envelope)).toThrow();
    expect(() => decryptTokens("org-a", "user-a", "google_calendar", envelope)).toThrow();
  });

  it("requests calendar invitations, Meet activity, and Zoom meeting permissions", () => {
    process.env.GOOGLE_MEETING_CLIENT_ID = "google-id";
    process.env.GOOGLE_MEETING_CLIENT_SECRET = "google-secret";
    process.env.GOOGLE_MEETING_REDIRECT_URI = "https://example.com/api/meeting-providers/google_calendar/callback";
    process.env.ZOOM_MEETING_CLIENT_ID = "zoom-id";
    process.env.ZOOM_MEETING_CLIENT_SECRET = "zoom-secret";
    process.env.ZOOM_MEETING_REDIRECT_URI = "https://example.com/api/meeting-providers/zoom/callback";
    const google = new URL(authorizationUrl("google_calendar", "state"));
    expect(google.origin).toBe("https://accounts.google.com");
    expect(google.searchParams.get("scope")).toContain("calendar.events");
    expect(google.searchParams.get("scope")).toContain("calendar.calendarlist.readonly");
    expect(google.searchParams.get("scope")).toContain("meetings.space.readonly");
    expect(google.searchParams.get("scope")).toContain("openid email");
    expect(google.searchParams.get("access_type")).toBe("offline");
    const zoom = new URL(authorizationUrl("zoom", "state"));
    expect(zoom.origin).toBe("https://zoom.us");
    expect(zoom.searchParams.get("scope")).toContain("meeting:write:meeting");
    expect(zoom.searchParams.get("scope")).toContain("cloud_recording:read:meeting_transcript");
    expect(zoom.searchParams.get("scope")).toContain("user:read:user");
  });
});
