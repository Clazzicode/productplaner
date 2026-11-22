"use client";

import Image from "next/image";
import { useState } from "react";
const cards = [
  { key: "google_meet", name: "Google Meet", logo: "/brands/google-meet.svg", detail: "Create video calls and send invitations through your Google Calendar.", action: "google_calendar" },
  { key: "google_calendar", name: "Google Calendar", logo: "/brands/google-calendar.svg", detail: "View your schedule and create calendar invitations for demos.", action: "google_calendar" },
  { key: "zoom", name: "Zoom", logo: "/brands/zoom-logo.png", detail: "Schedule Zoom calls and keep their details with each demo.", action: "zoom" },
  { key: "notion", name: "Notion", logo: "/brands/notion.svg", detail: "Import shared notes and reference pages into meeting records.", action: "notion" },
] as const;

export default function MeetingProviderConnections() {
  const [selected, setSelected] = useState("");
  return <section aria-labelledby="personal-connections" className="rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="personal-connections" className="text-xl font-bold text-[#0b1735]">Your connections</h2><p className="mt-1 text-sm text-[#64708c]">Each connection belongs to your account. Google Meet and Calendar use the same Google authorization.</p></div><span className="rounded-full bg-[#eeebff] px-3 py-1 text-xs font-semibold text-[#5145ed]">Personal integrations</span></div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">{cards.map((card) => {
      return <article key={card.key} className="flex min-h-52 flex-col rounded-xl border border-[#d9def0] bg-[#fdfdff] p-4 shadow-[0_2px_8px_rgba(20,31,75,.04)] sm:p-5">
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-xl border border-[#eceafa] bg-white"><Image src={card.logo} alt="" width={card.key === "zoom" ? 39 : 34} height={34} className="max-h-9 object-contain" /></span><h3 className="text-base font-bold text-[#0b1735]">{card.name}</h3></div><span className="shrink-0 rounded-full bg-[#f0efff] px-2.5 py-1 text-xs font-semibold text-[#5145ed]">Not connected</span></div>
        <p className="mt-3 text-sm leading-5 text-[#64708c]">{card.detail}</p>
        <p className="mt-2 break-all text-xs text-[#4f5c78]">{card.key === "google_meet" ? "Connect Google Calendar to use Meet." : "No account connected"}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5"><span className="text-xs text-[#7b86a0]">{card.key === "google_meet" ? "Shared Google connection" : "Your account"}</span><button type="button" onClick={() => setSelected(card.name)} className="rounded-lg bg-[#5145ed] px-4 py-2 text-sm font-semibold text-white">{`Connect ${card.name}`}</button></div>
      </article>;
    })}</div>
    {selected && <p role="status" className="mt-4 rounded-lg bg-[#f0efff] p-3 text-sm text-[#34415f]">{selected} account connection will be available when provider setup is complete. Your account is not connected yet.</p>}
  </section>;
}
