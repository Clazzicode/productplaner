import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { accessTokenFor } from "./providers";

export const meetingInputSchema = z.object({
  demoId: z.string().min(1).max(100),
  provider: z.enum(["google_meet", "zoom"]),
  title: z.string().trim().min(3).max(200),
  purpose: z.string().trim().max(4000).default(""),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  attendees: z.array(z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(254) })).max(50),
}).strict();
export type MeetingInput = z.infer<typeof meetingInputSchema>;

const calendarResponse = z.object({
  id: z.string(),
  hangoutLink: z.string().optional(),
  conferenceData: z.object({ entryPoints: z.array(z.object({ entryPointType: z.string(), uri: z.string() })).optional() }).optional(),
}).passthrough();

function checkedJoinUrl(value: string | null | undefined, provider: "google_meet" | "zoom"): string | null {
  if (!value) return null;
  const url = new URL(value);
  const zoomHost = url.hostname === "zoom.us" || url.hostname.endsWith(".zoom.us") || url.hostname === "zoom.com" || url.hostname.endsWith(".zoom.com");
  if (url.protocol !== "https:" || url.username || url.password || (provider === "google_meet" ? url.hostname !== "meet.google.com" : !zoomHost)) throw new Error("Provider returned an invalid meeting link.");
  return url.toString();
}

async function providerJson(url: string, token: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Meeting provider request failed (${response.status}). Check permissions and try again.`);
  return response.json() as Promise<unknown>;
}

export async function scheduleProviderMeeting(organizationId: string, userId: string, input: MeetingInput) {
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (!(start.getTime() > Date.now() + 60_000 && end.getTime() > start.getTime() && end.getTime() - start.getTime() <= 8 * 60 * 60 * 1000)) {
    throw new Error("Choose a future start and an end within eight hours.");
  }
  const calendarToken = await accessTokenFor(organizationId, userId, "google_calendar");
  let zoomId: string | null = null;
  let joinUrl: string | null = null;
  if (input.provider === "zoom") {
    const zoomToken = await accessTokenFor(organizationId, userId, "zoom");
    const raw = await providerJson("https://api.zoom.us/v2/users/me/meetings", zoomToken, {
      method: "POST",
      body: JSON.stringify({ topic: input.title, agenda: input.purpose, type: 2, start_time: start.toISOString(), duration: Math.ceil((end.getTime() - start.getTime()) / 60000), settings: { waiting_room: true } }),
    });
    const zoom = z.object({ id: z.union([z.string(), z.number()]), join_url: z.url() }).parse(raw);
    zoomId = String(zoom.id);
    joinUrl = checkedJoinUrl(zoom.join_url, "zoom");
  }

  const calendarUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1";
  const eventBody = {
    summary: input.title,
    description: [input.purpose, input.provider === "zoom" ? `Join Zoom: ${joinUrl}` : ""].filter(Boolean).join("\n\n"),
    start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() },
    attendees: input.attendees.map((person) => ({ email: person.email, displayName: person.name })),
    ...(input.provider === "google_meet" ? { conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : { location: joinUrl }),
  };
  let createdEventId: string | null = null;
  try {
    const event = calendarResponse.parse(await providerJson(calendarUrl, calendarToken, { method: "POST", body: JSON.stringify(eventBody) }));
    createdEventId = event.id;
    joinUrl = input.provider === "zoom" ? joinUrl : checkedJoinUrl(event.hangoutLink ?? event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri, "google_meet");
    return { providerMeetingId: zoomId, calendarEventId: event.id, joinUrl };
  } catch (error) {
    if (createdEventId) await cancelScheduledMeeting(organizationId, userId, { calendarEventId: createdEventId, providerMeetingId: zoomId });
    else if (zoomId) {
      try {
        const token = await accessTokenFor(organizationId, userId, "zoom");
        await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(zoomId)}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      } catch { /* The failed calendar operation is the user-facing error. */ }
    }
    throw error;
  }
}

export async function cancelScheduledMeeting(organizationId: string, userId: string, scheduled: { calendarEventId: string; providerMeetingId: string | null }) {
  try {
    const token = await accessTokenFor(organizationId, userId, "google_calendar");
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(scheduled.calendarEventId)}?sendUpdates=all`, {
      method: "DELETE", headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
  } catch { /* Best-effort compensation; original persistence error is reported. */ }
  if (scheduled.providerMeetingId) {
    try {
      const token = await accessTokenFor(organizationId, userId, "zoom");
      await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(scheduled.providerMeetingId)}`, {
        method: "DELETE", headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
      });
    } catch { /* Best-effort compensation; original persistence error is reported. */ }
  }
}

export async function resolveMeetLink(organizationId: string, userId: string, eventId: string): Promise<string | null> {
  const token = await accessTokenFor(organizationId, userId, "google_calendar");
  const event = calendarResponse.parse(await providerJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1`, token, {}));
  return checkedJoinUrl(event.hangoutLink ?? event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri, "google_meet");
}
