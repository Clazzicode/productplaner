"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CalendarEvent = { id: string; title: string; start: string | null; end: string | null; allDay: boolean; url: string | null; colorId?: string | null; calendarName?: string; calendarColor?: string | null; meetUrl?: string | null; recurring?: boolean; attendees?: { name: string | null; email: string | null; organizer: boolean }[] };
const pad = (value: number) => String(value).padStart(2, "0");
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const monthKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const today = () => new Date();
const palette = [
  "border-[#1a73e8] bg-[#dceaff] text-[#173866]",
  "border-[#8e63f4] bg-[#eee6ff] text-[#432871]",
  "border-[#3fba63] bg-[#e1f6e8] text-[#205d35]",
  "border-[#f2a43b] bg-[#fff0d7] text-[#704910]",
  "border-[#e57191] bg-[#ffe3ec] text-[#70263f]",
];
function tone(event: CalendarEvent) { const value = Number(event.colorId); return palette[Number.isFinite(value) && value > 0 ? value % palette.length : event.title.length % palette.length]; }
function occursOn(event: CalendarEvent, date: string) {
  if (!event.start) return false;
  const start = event.allDay ? event.start.slice(0, 10) : dayKey(new Date(event.start));
  if (!event.end) return start === date;
  const end = event.allDay ? event.end.slice(0, 10) : dayKey(new Date(new Date(event.end).getTime() - 1));
  return date >= start && (event.allDay ? date < end : date <= end);
}
function eventTime(event: CalendarEvent) {
  if (event.allDay) return "All day";
  if (!event.start) return "Time unavailable";
  const start = new Date(event.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const end = event.end ? new Date(event.end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
  return end ? `${start} – ${end}` : start;
}

export default function GoogleCalendarPanel({ accountEmail }: { accountEmail: string | null }) {
  const [anchor, setAnchor] = useState(today);
  const [view, setView] = useState<"month" | "week">("month");
  const [selectedDay, setSelectedDay] = useState(() => dayKey(today()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState("");
  const [error, setError] = useState("");
  const key = monthKey(anchor);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => {
    if (!accountEmail) return;
    const controller = new AbortController();
    fetch(`/api/calendar/events?month=${key}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not load Google Calendar."); return data as { events: CalendarEvent[] }; })
      .then((data) => { setEvents(data.events); setError(""); setLoaded(key); })
      .catch((reason) => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "Could not load Google Calendar."); setLoaded(key); } });
    return () => controller.abort();
  }, [accountEmail, key]);
  const days = useMemo(() => {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), view === "month" ? 1 : anchor.getDate());
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: view === "month" ? 42 : 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [anchor, view]);
  const selectedEvents = events.filter((event) => occursOn(event, selectedDay));
  const selectedEvent = selectedEvents.find((event) => event.id === selectedId) ?? selectedEvents[0] ?? null;
  const move = (direction: -1 | 1) => {
    const next = new Date(anchor);
    if (view === "month") next.setMonth(next.getMonth() + direction, 1);
    else next.setDate(next.getDate() + direction * 7);
    setAnchor(next); setSelectedDay(dayKey(next)); setSelectedId(null);
  };
  return <div className="space-y-4">
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dce1f0] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-xl bg-[#f3f5ff]"><Image src="/brands/google-calendar.svg" alt="" width={39} height={39} /></span><div><h2 className="text-lg font-bold text-[#101a35]">Your Google Calendar</h2><p className="text-sm text-[#64708c]">View and manage your demo schedule.</p></div></div>
      <div className="flex flex-wrap items-center gap-3">{accountEmail ? <><span className="rounded-full bg-[#e5f8ed] px-3 py-1 text-xs font-bold text-[#17834d]">✓ Connected</span><span className="break-all text-sm text-[#4f5c78]">{accountEmail}</span></> : <span className="rounded-full bg-[#f0efff] px-3 py-1 text-xs font-semibold text-[#5145ed]">Not connected</span>}</div>
      <div className="flex flex-wrap gap-2">{accountEmail && <a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#5145ed] px-4 py-2 text-sm font-semibold text-white">Open in Google Calendar ↗</a>}<Link href="/integrations" className="rounded-lg border border-[#d9def0] px-4 py-2 text-sm font-semibold text-[#34415f]">{accountEmail ? "Manage connection" : "Connect Google Calendar"}</Link></div>
    </section>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 rounded-2xl border border-[#dce1f0] bg-white p-3 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4"><div className="flex items-center gap-2"><button type="button" onClick={() => { const now = today(); setAnchor(now); setSelectedDay(dayKey(now)); }} className="rounded-lg border border-[#dce1f0] px-3 py-2 text-sm font-semibold text-[#34415f]">Today</button><button type="button" aria-label={view === "month" ? "Previous month" : "Previous week"} onClick={() => move(-1)} className="rounded-lg border border-[#dce1f0] px-3 py-2">‹</button><h3 className="min-w-36 text-center text-lg font-bold text-[#101a35]">{anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3><button type="button" aria-label={view === "month" ? "Next month" : "Next week"} onClick={() => move(1)} className="rounded-lg border border-[#dce1f0] px-3 py-2">›</button></div><div className="flex items-center gap-3"><div className="flex overflow-hidden rounded-lg border border-[#dce1f0]">{(["month", "week"] as const).map(option => <button key={option} type="button" onClick={() => setView(option)} aria-pressed={view === option} className={`px-4 py-2 text-sm font-semibold capitalize ${view === option ? "bg-[#5145ed] text-white" : "text-[#4f5c78]"}`}>{option}</button>)}</div><span className="text-xs text-[#64708c]">{timeZone.replaceAll("_", " ")}</span></div></div>
        {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <p aria-live="polite" className="sr-only">{loaded === key ? `${events.length} events loaded` : "Loading calendar"}</p>
        <div className="grid grid-cols-7 border-l border-t border-[#dce1f0] text-center text-xs font-semibold text-[#34415f]">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <div key={day} className="border-b border-r border-[#dce1f0] bg-[#f7f8fd] py-2">{day}</div>)}</div>
        <div className="grid grid-cols-7 border-l border-[#dce1f0]">{days.map(day => { const date = dayKey(day); const dayEvents = events.filter(event => occursOn(event, date)); return <div key={date} className={`min-h-28 min-w-0 border-b border-r border-[#dce1f0] p-1 sm:min-h-32 sm:p-1.5 ${day.getMonth() === anchor.getMonth() ? "bg-white" : "bg-[#f9faff]"}`}><button type="button" onClick={() => { setSelectedDay(date); setSelectedId(null); }} aria-label={`${day.toDateString()}, ${dayEvents.length} events`} aria-pressed={selectedDay === date} className={`mb-1 grid size-6 place-items-center rounded-full text-xs font-semibold ${selectedDay === date ? "bg-[#5145ed] text-white" : "text-[#34415f]"}`}>{day.getDate()}</button><div className="space-y-1">{dayEvents.slice(0, view === "week" ? 12 : 3).map(event => <button key={event.id} type="button" onClick={() => { setSelectedDay(date); setSelectedId(event.id); }} style={event.calendarColor ? { borderLeftColor: event.calendarColor } : undefined} className={`block w-full overflow-hidden rounded border-l-[3px] px-1 py-0.5 text-left text-[10px] leading-tight sm:text-[11px] ${tone(event)} ${selectedId === event.id ? "ring-1 ring-[#5145ed]" : ""}`}><span className="block truncate font-bold">{event.title}</span><span className="hidden truncate sm:block">{eventTime(event)}</span></button>)}{dayEvents.length > (view === "week" ? 12 : 3) && <button type="button" onClick={() => setSelectedDay(date)} className="text-[10px] font-semibold text-[#5145ed]">+{dayEvents.length - (view === "week" ? 12 : 3)} more</button>}</div></div>; })}</div>
      </section>
      <aside className="space-y-4"><section className="rounded-2xl border border-[#dce1f0] bg-white p-5 shadow-sm"><h3 className="text-lg font-bold text-[#101a35]">Selected event</h3>{selectedEvent ? <><div style={selectedEvent.calendarColor ? { borderLeftColor: selectedEvent.calendarColor } : undefined} className={`mt-4 rounded-lg border-l-4 p-4 ${tone(selectedEvent)}`}><h4 className="font-bold">{selectedEvent.title}</h4><p className="mt-1 text-xs">{selectedEvent.calendarName}</p><p className="mt-2 text-xs">{new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p><p className="mt-1 text-xs">{eventTime(selectedEvent)} ({timeZone.replaceAll("_", " ")})</p>{selectedEvent.recurring && <p className="mt-1 text-xs font-semibold">Recurring event</p>}</div>{!!selectedEvent.attendees?.length && <div className="mt-4 border-t border-[#e4e8f3] pt-3"><p className="text-xs font-bold text-[#64708c]">Guests ({selectedEvent.attendees.length})</p><ul className="mt-2 space-y-1 text-xs text-[#34415f]">{selectedEvent.attendees.map((attendee, index) => <li key={`${attendee.email}-${index}`} className="break-all">♙ &nbsp;{attendee.name || attendee.email || "Guest"}{attendee.organizer ? " (Organizer)" : ""}</li>)}</ul></div>}<div className="mt-4 flex flex-col gap-2 border-t border-[#e4e8f3] pt-3">{selectedEvent.url && <a href={selectedEvent.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#5145ed]">Open event in Google Calendar ↗</a>}{selectedEvent.meetUrl && <a href={selectedEvent.meetUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#5145ed]">▣ &nbsp;Join Google Meet ↗</a>}</div></> : <p className="mt-4 text-sm text-[#64708c]">{accountEmail ? `No event selected for ${new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" })}.` : "Connect Google Calendar to see event details and guests."}</p>}</section>{!accountEmail && <section className="rounded-2xl border border-[#dce1f0] bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><Image src="/brands/google-calendar.svg" alt="" width={36} height={36} /><p className="text-sm font-semibold text-[#101a35]">Connect Google Calendar to view your schedule.</p></div><Link href="/integrations" className="ml-12 mt-3 inline-block rounded-lg bg-[#5145ed] px-5 py-2 text-sm font-semibold text-white">Connect</Link></section>}</aside>
    </div>
  </div>;
}
