"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

type Meeting = {
  id: string; title: string; isOrganizer: boolean; scheduledAt: string | null; scheduledEndAt: string | null;
  joinUrl: string | null; status: string; notes: string; transcriptText: string; transcriptSource: "provider" | "imported" | "manual" | null; summary: string;
  actualStartedAt: string | null; actualEndedAt: string | null;
  participants: { name: string; email: string | null; status: string; providerDisplayName: string | null; joinedAt: string | null; leftAt: string | null }[];
};

export default function DemoMeetingManager(props: {
  initiativeId: string; demoId: string; demoTitle: string; provider: "google_meet" | "zoom";
  calendarConnected: boolean; calendarEmail: string | null; zoomConnected: boolean; zoomEmail: string | null; canEdit: boolean; meetings: Meeting[];
  notionConnected: boolean;
  canUseIntegrations: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(`${props.demoTitle} demo`);
  const [purpose, setPurpose] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [attendees, setAttendees] = useState("");
  const [notionPage, setNotionPage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { notes: string; transcriptText: string; summary: string; transcriptSource: "provider" | "imported" | "manual" | null }>>({});
  const connected = props.calendarConnected && (props.provider === "google_meet" || props.zoomConnected);
  const providerName = props.provider === "google_meet" ? "Google Meet" : "Zoom";

  function draftFor(meeting: Meeting) {
    return drafts[meeting.id] ?? { notes: meeting.notes, transcriptText: meeting.transcriptText, summary: meeting.summary, transcriptSource: meeting.transcriptSource };
  }
  function updateDraft(meeting: Meeting, values: Partial<ReturnType<typeof draftFor>>) {
    setDrafts((current) => ({ ...current, [meeting.id]: { ...draftFor(meeting), ...values } }));
  }
  async function schedule() {
    setError(""); setMessage("");
    const guests = attendees.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const match = line.match(/^(.+?)\s*<([^<>\s]+@[^<>\s]+)>$/);
      return match ? { name: match[1].trim(), email: match[2].trim() } : { name: line.split("@")[0], email: line };
    });
    if (!startsAt || !endsAt) { setError("Choose a start and end time."); return; }
    setBusy(true);
    const result = await apiFetch<{ meetingId: string; joinUrl: string | null }>(`/api/initiatives/${props.initiativeId}/meetings`, { method: "POST", body: {
      demoId: props.demoId, provider: props.provider, title, purpose,
      startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), attendees: guests,
    } });
    setBusy(false);
    if (!result.ok) { setError(result.error ?? "Could not schedule meeting."); return; }
    setMessage(guests.length ? (result.data?.joinUrl ? "Meeting created and calendar invitations sent." : "Calendar invitations sent. The Meet link is still being prepared by Google; refresh this page shortly.") : "Meeting created on the organizer’s Google Calendar. Add guests when scheduling to send invitations.");
    router.refresh();
  }
  async function save(meeting: Meeting) {
    setBusy(true); setError(""); setMessage("");
    const result = await apiFetch(`/api/meetings/${meeting.id}`, { method: "PATCH", body: draftFor(meeting) });
    setBusy(false);
    if (!result.ok) { setError(result.error ?? "Could not save meeting notes."); return; }
    setMessage("Meeting notes, transcript, and summary saved."); router.refresh();
  }
  async function summarize(meeting: Meeting) {
    setBusy(true); setError(""); setMessage("");
    const result = await apiFetch<{ summary: string }>(`/api/meetings/${meeting.id}/summary`, { method: "POST", body: {} });
    setBusy(false);
    if (!result.ok || !result.data?.summary) { setError(result.error ?? "Could not create summary."); return; }
    updateDraft(meeting, { summary: result.data.summary });
    setMessage("AI summary drafted. Review and save it before using it.");
  }
  async function refreshLink(meeting: Meeting) {
    setBusy(true); setError("");
    const result = await apiFetch<{ joinUrl?: string; pending?: boolean }>(`/api/meetings/${meeting.id}/refresh-link`, { method: "POST", body: {} });
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not refresh the Meet link.");
    else { setMessage(result.data?.pending ? "Google is still preparing the Meet link." : "Meet link is ready."); router.refresh(); }
  }
  async function syncActivity(meeting: Meeting) {
    setBusy(true); setError(""); setMessage("");
    const result = await apiFetch<{ observed: number }>(`/api/meetings/${meeting.id}/attendance`, { method: "POST", body: {} });
    setBusy(false);
    if (!result.ok) { setError(result.error ?? "Could not sync meeting activity."); return; }
    setMessage(`${result.data?.observed ?? 0} provider participant records checked. Display names without a matching email remain unmatched.`);
    router.refresh();
  }
  async function importText(meeting: Meeting, field: "notes" | "transcriptText", file?: File) {
    if (!file) return;
    if (file.size > 200000 || !/\.(txt|md|vtt)$/i.test(file.name)) { setError("Import a .txt, .md, or .vtt file smaller than 200 KB."); return; }
    const text = await file.text();
    updateDraft(meeting, { [field]: [draftFor(meeting)[field], text].filter(Boolean).join("\n\n"), ...(field === "transcriptText" ? { transcriptSource: "imported" as const } : {}) });
    setMessage(`${file.name} added to the editor. Save to keep it.`);
  }
  async function importNotion(meeting: Meeting) {
    setBusy(true); setError(""); setMessage("");
    const result = await apiFetch<{ pageId: string; text: string }>(`/api/meetings/${meeting.id}/notion`, { method: "POST", body: { page: notionPage } });
    setBusy(false);
    if (!result.ok || !result.data) { setError(result.error ?? "Could not import Notion notes."); return; }
    updateDraft(meeting, { notes: [draftFor(meeting).notes, `Imported from Notion page ${result.data.pageId}:\n${result.data.text}`].filter(Boolean).join("\n\n") });
    setMessage("Notion notes added to the editor. Review and save them.");
  }
  return <div className="space-y-5">
    <section className="rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#f5f4ff]"><Image src={props.provider === "google_meet" ? "/brands/google-meet.svg" : "/brands/zoom-logo.png"} alt="" width={props.provider === "google_meet" ? 30 : 38} height={30} className="object-contain" /></span><h2 className="text-xl font-bold">{providerName} meetings</h2></div><span className={`text-xs font-semibold ${connected ? "text-emerald-700" : "text-amber-700"}`}>{connected ? "Ready to schedule" : "Connection needed"}</span></div>
      <p className="mt-2 text-sm text-slate-600">{props.provider === "zoom" ? "Zoom creates the call; Google Calendar sends an invitation containing its join link." : "Google Calendar creates the Meet link and sends the invitation."} Planned guests and observed attendance are tracked separately.</p>
      {props.calendarEmail && <p className="mt-2 text-sm text-slate-600">Invitations and calendar event: <strong>{props.calendarEmail}</strong>{props.provider === "zoom" && props.zoomEmail ? <> · Zoom host: <strong>{props.zoomEmail}</strong></> : null}</p>}
      {!connected && props.canUseIntegrations && <Link href="/integrations" className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Connect {props.calendarConnected ? "Zoom" : "Google Calendar"}</Link>}
      {connected && props.canUseIntegrations && <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Meeting title<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        <label className="text-sm font-medium">Starts<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        <label className="text-sm font-medium">Ends<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        <label className="text-sm font-medium sm:col-span-2">Purpose<textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} className="mt-1 w-full rounded border p-2" rows={2} /></label>
        <label className="text-sm font-medium sm:col-span-2">Guests, one per line (Name &lt;email@example.com&gt;)<textarea value={attendees} onChange={(event) => setAttendees(event.target.value)} className="mt-1 w-full rounded border p-2" rows={3} placeholder="Jordan Lee <jordan@example.com>" /></label>
        <button type="button" disabled={busy} onClick={schedule} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Scheduling…" : `Create ${providerName} meeting and send invites`}</button>
      </div>}
    </section>
    {props.meetings.length === 0 && <p className="rounded-xl border border-dashed p-5 text-sm text-slate-600">No {providerName} meeting has been scheduled for this demo.</p>}
    {props.meetings.map((meeting) => {
      const draft = draftFor(meeting);
      return <section key={meeting.id} className="rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm">
        <h3 className="font-bold">{meeting.title}</h3>
        <p className="mt-1 text-sm text-slate-600">Scheduled: {meeting.scheduledAt ? new Date(meeting.scheduledAt).toLocaleString() : "—"} to {meeting.scheduledEndAt ? new Date(meeting.scheduledEndAt).toLocaleString() : "—"}</p>
        {meeting.joinUrl ? <a href={meeting.joinUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-sm font-semibold text-indigo-700 underline">Join {providerName} meeting ↗</a> : <p className="mt-2 text-sm text-amber-700">Provider link pending. Calendar invitation has been created. {props.provider === "google_meet" && meeting.isOrganizer && <button type="button" disabled={busy} onClick={() => refreshLink(meeting)} className="font-semibold underline">Refresh link</button>}</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><h4 className="text-sm font-semibold">Invited guests</h4><ul className="mt-2 space-y-1 text-sm">{meeting.participants.filter((person) => person.status !== "unmatched").map((person, index) => <li key={index}>{person.name} {person.email ? `(${person.email})` : ""} · {person.status}</li>)}</ul>{meeting.participants.length === 0 && <p className="mt-2 text-sm text-slate-500">No guests invited.</p>}</div><div><h4 className="text-sm font-semibold">Observed activity</h4><p className="mt-2 text-sm text-slate-600">Started: {meeting.actualStartedAt ? new Date(meeting.actualStartedAt).toLocaleString() : "Not reported"}<br/>Ended: {meeting.actualEndedAt ? new Date(meeting.actualEndedAt).toLocaleString() : "Not reported"}</p><ul className="mt-2 text-sm">{meeting.participants.filter((person) => person.status === "joined" || person.status === "unmatched").map((person, index) => <li key={index}>{person.providerDisplayName ?? person.name} · joined {person.joinedAt ? new Date(person.joinedAt).toLocaleString() : "time unknown"} · {person.status}</li>)}</ul>{meeting.isOrganizer && <button type="button" disabled={busy} onClick={() => syncActivity(meeting)} className="mt-2 rounded border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50">Sync provider activity</button>}</div></div>
        <div className="mt-5 grid gap-4 border-t pt-4"><label className="text-sm font-semibold">Meeting notes<textarea disabled={!props.canEdit} value={draft.notes} onChange={(event) => updateDraft(meeting, { notes: event.target.value })} rows={5} className="mt-1 w-full rounded border p-2 font-normal" /></label>{props.canEdit && <label className="text-xs text-indigo-700">Import notes (.txt, .md, .vtt)<input type="file" accept=".txt,.md,.vtt,text/plain,text/markdown" onChange={(event) => importText(meeting, "notes", event.target.files?.[0])} className="mt-1 block" /></label>}
          {props.canUseIntegrations && <div className="flex flex-wrap items-end gap-2"><label className="min-w-[220px] flex-1 text-xs font-semibold">Notion page URL or ID<input value={notionPage} onChange={(event) => setNotionPage(event.target.value)} className="mt-1 w-full rounded border p-2 text-sm font-normal" /></label>{props.notionConnected ? <button type="button" disabled={busy || !notionPage.trim()} onClick={() => importNotion(meeting)} className="rounded border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50">Import Notion notes</button> : <Link href="/integrations" className="rounded border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-700">Connect Notion</Link>}</div>}
          <label className="text-sm font-semibold">Transcript<textarea disabled={!props.canEdit} value={draft.transcriptText} onChange={(event) => updateDraft(meeting, { transcriptText: event.target.value, transcriptSource: "manual" })} rows={7} className="mt-1 w-full rounded border p-2 font-normal" /></label>{props.canEdit && <label className="text-xs text-indigo-700">Import transcript (.txt, .md, .vtt)<input type="file" accept=".txt,.md,.vtt,text/plain,text/markdown" onChange={(event) => importText(meeting, "transcriptText", event.target.files?.[0])} className="mt-1 block" /></label>}
          <label className="text-sm font-semibold">Summary<textarea disabled={!props.canEdit} value={draft.summary} onChange={(event) => updateDraft(meeting, { summary: event.target.value })} rows={6} className="mt-1 w-full rounded border p-2 font-normal" /></label>
          {props.canEdit && <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => save(meeting)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save meeting record</button><button type="button" disabled={busy} onClick={() => summarize(meeting)} className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">Draft summary with AI</button></div>}
        </div>
      </section>;
    })}
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
  </div>;
}
