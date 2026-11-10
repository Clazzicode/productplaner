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
  start: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(),
  end: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(),
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
    const items: z.infer<typeof googleEvents>["items"] = [];
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
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
    return NextResponse.json({ events: items.filter((event) => event.status !== "cancelled").map((event) => ({
      id: event.id, title: event.summary?.trim() || "Busy", start: event.start?.dateTime ?? event.start?.date ?? null,
      end: event.end?.dateTime ?? event.end?.date ?? null, allDay: !!event.start?.date,
      url: event.htmlLink?.startsWith("https://www.google.com/calendar/") ? event.htmlLink : null,
    })) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "Could not load your calendar.", 502); }
}

export const GET = withAuthenticatedApi(GETHandler);
