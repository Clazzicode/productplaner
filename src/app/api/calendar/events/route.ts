import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { accessTokenFor } from "@/lib/meetings/providers";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";

const googleEvents = z.object({ items: z.array(z.object({
  id: z.string(), summary: z.string().optional(), status: z.string().optional(), htmlLink: z.string().optional(),
  colorId: z.string().optional(), hangoutLink: z.string().optional(), recurringEventId: z.string().optional(),
  attendees: z.array(z.object({ displayName: z.string().optional(), email: z.string().optional(), organizer: z.boolean().optional() }).passthrough()).optional(),
  start: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(),
  end: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(),
}).passthrough()).optional(), nextPageToken: z.string().optional() }).passthrough();
const calendarList = z.object({ items: z.array(z.object({
  id: z.string(), summary: z.string().optional(), backgroundColor: z.string().optional(), hidden: z.boolean().optional(), selected: z.boolean().optional(),
}).passthrough()).optional(), nextPageToken: z.string().optional() }).passthrough();

async function GETHandler(request: Request) {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const query = new URL(request.url).searchParams;
  const month = query.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return jsonError("Choose a valid calendar month.", 422);
  const [year, number] = month.split("-").map(Number);
  if (year < 2000 || year > 2100) return jsonError("Choose a valid calendar month.", 422);
  const from = new Date(Date.UTC(year, number - 1, -6));
  const until = new Date(Date.UTC(year, number, 8));
  try {
    const token = await accessTokenFor(auth.user.organizationId, auth.user.id, "google_calendar");
    const calendars: z.infer<typeof calendarList>["items"] = [];
    let calendarCursor = "";
    for (let page = 0; page < 5; page++) {
      const listUrl = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
      listUrl.searchParams.set("maxResults", "250");
      if (calendarCursor) listUrl.searchParams.set("pageToken", calendarCursor);
      const listResponse = await fetch(listUrl, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
      if (!listResponse.ok) throw new Error(`Google Calendar could not load your calendars (${listResponse.status}). Reconnect your Google account to grant calendar-list access.`);
      const list = calendarList.parse(await listResponse.json());
      calendars.push(...(list.items ?? []));
      calendarCursor = list.nextPageToken ?? "";
      if (!calendarCursor) break;
    }
    const visible = calendars.filter(calendar => !calendar.hidden && calendar.selected !== false).slice(0, 50);
    const events = await Promise.all(visible.map(async calendar => {
      const items: NonNullable<z.infer<typeof googleEvents>["items"]> = [];
      let cursor = "";
      for (let page = 0; page < 5; page++) {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`);
      url.searchParams.set("timeMin", from.toISOString());
      url.searchParams.set("timeMax", until.toISOString());
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "250");
      if (cursor) url.searchParams.set("pageToken", cursor);
      const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Google Calendar could not load events (${response.status}). Reconnect your account if access expired.`);
      const batch = googleEvents.parse(await response.json());
      items.push(...(batch.items ?? []));
      cursor = batch.nextPageToken ?? "";
      if (!cursor) break;
      }
      return items.filter((event) => event.status !== "cancelled").map((event) => ({
      id: `${calendar.id}:${event.id}`, title: event.summary?.trim() || "Busy", start: event.start?.dateTime ?? event.start?.date ?? null,
      end: event.end?.dateTime ?? event.end?.date ?? null, allDay: !!event.start?.date,
      url: event.htmlLink?.startsWith("https://www.google.com/calendar/") ? event.htmlLink : null,
      colorId: event.colorId ?? null,
      meetUrl: event.hangoutLink?.startsWith("https://meet.google.com/") ? event.hangoutLink : null,
      recurring: !!event.recurringEventId,
      attendees: (event.attendees ?? []).map((attendee) => ({ name: attendee.displayName ?? null, email: attendee.email ?? null, organizer: !!attendee.organizer })),
      calendarName: calendar.summary ?? "Calendar",
      calendarColor: calendar.backgroundColor?.match(/^#[0-9a-fA-F]{6}$/) ? calendar.backgroundColor : null,
    }));
    }));
    return NextResponse.json({ events: events.flat() }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "Could not load your calendar.", 502); }
}

export const GET = withAuthenticatedApi(GETHandler);
