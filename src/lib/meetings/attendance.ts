import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { accessTokenFor } from "./providers";

type Observation = { key: string; displayName: string; email: string | null; joinedAt: Date | null; leftAt: Date | null };
type Activity = { startedAt: Date | null; endedAt: Date | null; participants: Observation[]; transcriptText: string | null };

async function getJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Provider attendance is unavailable (${response.status}). The meeting may still be active or the account may need more permissions.`);
  return response.json() as Promise<unknown>;
}

function asDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function readLimitedText(response: Response, limit: number): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) return null;
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function zoomActivity(organizationId: string, userId: string, meetingId: string): Promise<Activity> {
  const token = await accessTokenFor(organizationId, userId, "zoom");
  const identifier = encodeURIComponent(meetingId);
  const details = z.object({ start_time: z.string().optional(), end_time: z.string().optional() }).passthrough().parse(await getJson(`https://api.zoom.us/v2/past_meetings/${identifier}`, token));
  const schema = z.object({ participants: z.array(z.object({ name: z.string().optional(), user_id: z.string().optional(), user_email: z.string().optional(), join_time: z.string().optional(), leave_time: z.string().optional() }).passthrough()), next_page_token: z.string().optional() });
  const participants: Observation[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page++) {
    const url = new URL(`https://api.zoom.us/v2/past_meetings/${identifier}/participants`);
    url.searchParams.set("page_size", "300");
    if (pageToken) url.searchParams.set("next_page_token", pageToken);
    const result = schema.parse(await getJson(url.toString(), token));
    for (const person of result.participants) {
      const key = createHash("sha256").update(`${person.user_id ?? ""}:${person.join_time ?? ""}:${person.name ?? ""}`).digest("hex");
      participants.push({ key, displayName: person.name?.trim() || "Unknown Zoom participant", email: person.user_email?.trim().toLowerCase() || null, joinedAt: asDate(person.join_time), leftAt: asDate(person.leave_time) });
    }
    pageToken = result.next_page_token ?? "";
    if (!pageToken) break;
  }
  let transcriptText: string | null = null;
  const transcriptResponse = await fetch(`https://api.zoom.us/v2/meetings/${identifier}/transcript`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
  if (transcriptResponse.ok) {
    const transcript = z.object({ download_url: z.string().nullable().optional(), can_download: z.boolean().optional() }).passthrough().parse(await transcriptResponse.json());
    if (transcript.can_download && transcript.download_url) {
      const download = new URL(transcript.download_url);
      if (download.protocol === "https:" && !download.username && !download.password && (download.hostname === "zoom.us" || download.hostname.endsWith(".zoom.us") || download.hostname === "zoom.com" || download.hostname.endsWith(".zoom.com"))) {
        const file = await fetch(download, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
        if (file.ok) {
          const length = Number(file.headers.get("content-length"));
          if (!Number.isFinite(length) || length <= 200000) transcriptText = await readLimitedText(file, 200000);
        }
      }
    }
  }
  return { startedAt: asDate(details.start_time), endedAt: asDate(details.end_time), participants, transcriptText };
}

async function meetActivity(organizationId: string, userId: string, joinUrl: string, scheduledAt: Date | null): Promise<Activity> {
  const code = new URL(joinUrl).pathname.split("/").filter(Boolean)[0];
  if (!code || !/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(code)) throw new Error("Google Meet code is unavailable.");
  const token = await accessTokenFor(organizationId, userId, "google_calendar");
  const recordsUrl = new URL("https://meet.googleapis.com/v2/conferenceRecords");
  recordsUrl.searchParams.set("filter", `space.meeting_code = "${code}"`);
  const records = z.object({ conferenceRecords: z.array(z.object({ name: z.string(), startTime: z.string().optional(), endTime: z.string().optional() })).optional() }).parse(await getJson(recordsUrl.toString(), token));
  const relevant = (records.conferenceRecords ?? []).filter((record) => !scheduledAt || Math.abs((asDate(record.startTime)?.getTime() ?? 0) - scheduledAt.getTime()) < 24 * 60 * 60 * 1000);
  const record = relevant.sort((a, b) => (asDate(b.startTime)?.getTime() ?? 0) - (asDate(a.startTime)?.getTime() ?? 0))[0];
  if (!record) return { startedAt: null, endedAt: null, participants: [], transcriptText: null };
  if (!/^conferenceRecords\/[A-Za-z0-9_-]+$/.test(record.name)) throw new Error("Invalid Google conference record.");
  const schema = z.object({ participants: z.array(z.object({ name: z.string(), earliestStartTime: z.string().optional(), latestEndTime: z.string().optional(), signedinUser: z.object({ displayName: z.string() }).optional(), anonymousUser: z.object({ displayName: z.string() }).optional(), phoneUser: z.object({ displayName: z.string() }).optional() })).optional(), nextPageToken: z.string().optional() });
  const participants: Observation[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page++) {
    const url = new URL(`https://meet.googleapis.com/v2/${record.name}/participants`);
    url.searchParams.set("pageSize", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = schema.parse(await getJson(url.toString(), token));
    for (const person of result.participants ?? []) participants.push({
      key: person.name, displayName: person.signedinUser?.displayName ?? person.anonymousUser?.displayName ?? person.phoneUser?.displayName ?? "Unknown Meet participant",
      email: null, joinedAt: asDate(person.earliestStartTime), leftAt: asDate(person.latestEndTime),
    });
    pageToken = result.nextPageToken ?? "";
    if (!pageToken) break;
  }
  let transcriptText: string | null = null;
  try {
    const transcripts = z.object({ transcripts: z.array(z.object({ name: z.string(), state: z.string().optional() })).optional() }).parse(await getJson(`https://meet.googleapis.com/v2/${record.name}/transcripts`, token));
    const ready = transcripts.transcripts?.find((item) => item.state === "FILE_GENERATED" && /^conferenceRecords\/[A-Za-z0-9_-]+\/transcripts\/[A-Za-z0-9_-]+$/.test(item.name));
    if (ready) {
    const entrySchema = z.object({ transcriptEntries: z.array(z.object({ text: z.string(), participant: z.string().optional(), startTime: z.string().optional() })).optional(), nextPageToken: z.string().optional() });
    const lines: string[] = [];
    let cursor = "";
    for (let page = 0; page < 20; page++) {
      const url = new URL(`https://meet.googleapis.com/v2/${ready.name}/entries`);
      url.searchParams.set("pageSize", "100");
      if (cursor) url.searchParams.set("pageToken", cursor);
      const result = entrySchema.parse(await getJson(url.toString(), token));
      for (const entry of result.transcriptEntries ?? []) {
        const speaker = participants.find((person) => person.key === entry.participant)?.displayName ?? "Speaker unknown";
        lines.push(`${entry.startTime ?? ""} ${speaker}: ${entry.text}`.trim());
      }
      cursor = result.nextPageToken ?? "";
      if (!cursor || lines.join("\n").length > 200000) break;
    }
      transcriptText = lines.join("\n").slice(0, 200000) || null;
    }
  } catch {
    // Attendance remains useful when transcription is disabled or still processing.
  }
  return { startedAt: asDate(record.startTime), endedAt: asDate(record.endTime), participants, transcriptText };
}

export async function syncAttendance(meeting: { id: string; organizationId: string; createdByUserId: string; provider: string | null; providerMeetingId: string | null; joinUrl: string | null; scheduledAt: Date | null }) {
  let activity: Activity;
  if (meeting.provider === "zoom" && meeting.providerMeetingId) activity = await zoomActivity(meeting.organizationId, meeting.createdByUserId, meeting.providerMeetingId);
  else if (meeting.provider === "google_meet" && meeting.joinUrl) activity = await meetActivity(meeting.organizationId, meeting.createdByUserId, meeting.joinUrl, meeting.scheduledAt);
  else throw new Error("This meeting has no provider link to sync.");
  await withTransaction(async (tx) => {
    const invited = await tx.planningMeetingParticipant.findMany({ where: { organizationId: meeting.organizationId, meetingId: meeting.id, participantEmailSnapshot: { not: null } } });
    for (const person of activity.participants) {
      const prior = await tx.planningMeetingParticipant.findFirst({ where: { organizationId: meeting.organizationId, meetingId: meeting.id, providerParticipantId: person.key } });
      const match = !prior && person.email ? invited.find((guest) => guest.participantEmailSnapshot?.toLowerCase() === person.email) : null;
      if (prior || match) {
        const existing = prior ?? match!;
        await tx.planningMeetingParticipant.update({ where: { id: existing.id }, data: {
          attendanceStatus: "joined", providerDisplayName: person.displayName,
          providerParticipantId: existing.providerParticipantId ?? person.key,
          joinedAt: existing.joinedAt && person.joinedAt && existing.joinedAt < person.joinedAt ? existing.joinedAt : person.joinedAt,
          leftAt: existing.leftAt && person.leftAt && existing.leftAt > person.leftAt ? existing.leftAt : person.leftAt,
        } });
      } else {
        await tx.planningMeetingParticipant.create({ data: {
          organizationId: meeting.organizationId, meetingId: meeting.id, participantNameSnapshot: person.displayName,
          participantEmailSnapshot: person.email, attendanceStatus: "unmatched", providerDisplayName: person.displayName,
          providerParticipantId: person.key, joinedAt: person.joinedAt, leftAt: person.leftAt,
        } });
      }
    }
    const current = await tx.planningMeeting.findUniqueOrThrow({ where: { id: meeting.id } });
    await tx.planningMeeting.update({ where: { id: meeting.id }, data: {
      actualStartedAt: activity.startedAt, actualEndedAt: activity.endedAt,
      ...(activity.endedAt ? { status: "completed" } : {}),
      ...(activity.transcriptText && (!current.transcriptText || current.transcriptSource === "provider") ? { transcriptText: activity.transcriptText, transcriptSource: "provider" } : {}),
    } });
  });
  return { observed: activity.participants.length, startedAt: activity.startedAt, endedAt: activity.endedAt };
}
