"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CalendarEvent = { id: string; title: string; start: string | null; end: string | null; allDay: boolean; url: string | null };
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const occursOn = (event: CalendarEvent, date: string) => {
  if (!event.start) return false;
  const start = event.allDay ? event.start.slice(0, 10) : dayKey(new Date(event.start));
  if (!event.end) return start === date;
  const end = event.allDay ? event.end.slice(0, 10) : dayKey(new Date(new Date(event.end).getTime() - 1));
  return date >= start && (event.allDay ? date < end : date <= end);
};

export default function GoogleCalendarPanel({ accountEmail }: { accountEmail: string | null }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const key = monthKey(month);
  const loading = accountEmail !== null && loadedKey !== key;
  useEffect(() => {
    if (!accountEmail) return;
    const controller = new AbortController();
    fetch(`/api/calendar/events?month=${key}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not load Google Calendar."); return data as { events: CalendarEvent[] }; })
      .then((data) => { setEvents(data.events); setError(""); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load Google Calendar."); })
      .finally(() => { if (!controller.signal.aborted) setLoadedKey(key); });
    return () => controller.abort();
  }, [accountEmail, key]);
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [month]);
  const selectedEvents = events.filter((event) => occursOn(event, selected));
  return <section className="rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-[#101a35]">Your Google Calendar</h2><p className="mt-1 text-sm text-slate-600">{accountEmail ? `Connected as ${accountEmail}` : "Connect your Google account to see your schedule here."}</p></div><Link href="/integrations" className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700">{accountEmail ? "Manage connection" : "Connect Google Calendar"}</Link></div>
    {accountEmail && <>
      <div className="mt-6 flex items-center justify-between gap-3"><h3 className="text-lg font-semibold text-[#101a35]">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3><div className="flex gap-2"><button type="button" aria-label="Previous month" onClick={() => { const next = new Date(month.getFullYear(), month.getMonth() - 1, 1); setError(""); setMonth(next); setSelected(dayKey(next)); }} className="rounded border px-3 py-1.5">←</button><button type="button" onClick={() => { const today = new Date(); setError(""); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(dayKey(today)); }} className="rounded border px-3 py-1.5 text-sm">Today</button><button type="button" aria-label="Next month" onClick={() => { const next = new Date(month.getFullYear(), month.getMonth() + 1, 1); setError(""); setMonth(next); setSelected(dayKey(next)); }} className="rounded border px-3 py-1.5">→</button></div></div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <p aria-live="polite" className="mt-2 text-xs text-slate-500">{loading ? "Loading your Google Calendar…" : `${events.length} events loaded. Times use your device time zone.`}</p>
      <div className="mt-4 grid grid-cols-7 text-center text-xs font-semibold text-slate-600">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} className="py-2">{day}</span>)}</div>
      <div className="grid grid-cols-7 border-l border-t border-[#dfe3f2]">{days.map((day) => { const date = dayKey(day); const count = events.filter((event) => occursOn(event, date)).length; return <button type="button" key={date} onClick={() => setSelected(date)} aria-label={`${day.toDateString()}, ${count} events`} aria-pressed={selected === date} className={`min-h-20 border-b border-r border-[#dfe3f2] p-1 text-left align-top sm:min-h-24 sm:p-2 ${day.getMonth() !== month.getMonth() ? "bg-slate-50 text-slate-400" : "text-slate-800"} ${selected === date ? "ring-2 ring-inset ring-indigo-500" : ""}`}><span className="text-xs font-semibold">{day.getDate()}</span>{count > 0 && <span className="mt-1 block rounded bg-indigo-100 px-1 py-0.5 text-[10px] font-semibold text-indigo-800 sm:text-xs">{count} event{count === 1 ? "" : "s"}</span>}</button>; })}</div>
      <div className="mt-5"><h3 className="font-semibold text-[#101a35]">{new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h3>{selectedEvents.length ? <ul className="mt-3 space-y-2">{selectedEvents.map((event) => <li key={event.id} className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm"><span className="font-semibold">{event.title}</span><span className="ml-2 text-slate-600">{event.allDay ? "All day" : event.start ? new Date(event.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "Time unavailable"}</span>{event.url && <a href={event.url} target="_blank" rel="noopener noreferrer" className="ml-3 font-semibold text-indigo-700 underline">Open in Google Calendar ↗</a>}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No events on this day.</p>}</div>
    </>}
  </section>;
}
