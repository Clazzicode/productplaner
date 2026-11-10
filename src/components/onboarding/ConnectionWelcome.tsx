"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

type Provider = "jira" | "google_calendar" | "zoom" | "notion";
const tools = [
  { key: "jira", name: "Jira", description: "Bring project work into your planning space.", logos: ["/brands/jira.svg"] },
  { key: "google_calendar", name: "Google Calendar + Google Meet", description: "See your schedule, create Meet calls, and send invitations.", logos: ["/brands/google-calendar.svg", "/brands/google-meet.svg"] },
  { key: "zoom", name: "Zoom", description: "Create calls and track meeting activity.", logos: ["/brands/zoom-logo.png"] },
  { key: "notion", name: "Notion", description: "Import meeting notes and reference pages.", logos: ["/brands/notion.svg"] },
] as const;

export default function ConnectionWelcome({ connected }: { connected: string[] }) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  async function connect(provider: Provider) {
    setBusy(provider); setError("");
    const path = provider === "jira" ? "/api/atlassian/oauth/start" : provider === "notion" ? "/api/notion" : `/api/meeting-providers/${provider}`;
    const response = await apiFetch<{ authorizationUrl?: string }>(path, { method: "POST", ...(provider === "jira" ? {} : { body: { action: "connect" } }) });
    setBusy(null);
    if (!response.ok || !response.data?.authorizationUrl) { setError(response.error ?? "This connection is not available yet."); return; }
    window.location.assign(response.data.authorizationUrl);
  }
  return <main className="relative min-h-dvh overflow-hidden bg-[#e9eafa] text-[#101a35]">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none blur-[3px] opacity-45"><div className="flex min-h-dvh"><aside className="hidden w-60 shrink-0 bg-[#071935] p-5 text-white md:block"><h2 className="text-xl font-bold">Clarivia</h2><p className="text-[10px] tracking-widest">PRODUCT PLATFORM</p><div className="mt-12 space-y-5 text-sm"><p className="rounded-lg bg-[#5145ed] px-3 py-2">My menu</p><p>Initiatives</p><p>Requests &amp; Priorities</p><p>Features &amp; Backlog</p><p>Roadmap</p><p>Documents</p><p>Demos</p><p>Integrations</p></div></aside><div className="min-w-0 flex-1 bg-[#f7f7ff]"><header className="flex h-16 items-center justify-between border-b border-[#dce1f0] bg-white px-6"><span>Guided Planning</span><span>Find requests or features…</span><span>Create &nbsp; Avery</span></header><div className="p-8"><h2 className="text-2xl font-bold">Demo management</h2><div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]"><div className="h-[32rem] rounded-xl border border-[#dce1f0] bg-white p-6"><div className="flex gap-4"><span>Demo information</span><span>Google Meet</span><span>Zoom</span><span>Google Calendar</span></div><div className="mt-8 grid grid-cols-7 gap-1">{Array.from({ length: 35 }, (_, index) => <div key={index} className="h-20 border border-[#e2e5f1] bg-[#fbfbff]" />)}</div></div><div className="h-64 rounded-xl border border-[#dce1f0] bg-white p-6">Selected event</div></div></div></div></div></div>
    <div className="absolute inset-0 bg-[#d9dcfa]/30" />
    <div className="relative z-10 flex min-h-dvh items-center justify-center p-4 sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="connection-welcome-title" className="w-full max-w-[672px] rounded-2xl border border-[#dce1f0] bg-white p-6 shadow-[0_30px_90px_rgba(19,30,84,.22)] sm:p-8">
      <div className="flex items-start justify-between"><span className="rounded-full bg-[#eeebff] px-3 py-1 text-xs font-semibold text-[#5145ed]">Final setup · <span className="font-medium text-[#273356]">Connect your tools</span></span><Link href="/projects" aria-label="Skip connections" className="text-xl text-[#526180]">×</Link></div>
      <h1 id="connection-welcome-title" className="mt-5 text-3xl font-bold tracking-tight">Make Clarivia work for you</h1><p className="mt-1 text-sm text-[#526180]">Connect your tools now or set them up later. Each connection belongs to your account.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">{tools.map(tool => { const isConnected = connected.includes(tool.key); return <article key={tool.key} className="flex min-h-36 flex-col rounded-xl border border-[#d8dcf2] bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><div className="flex min-w-12 items-center gap-1">{tool.logos.map(logo => <span key={logo} className="grid size-11 place-items-center rounded-xl bg-[#f7f8ff]"><Image src={logo} alt="" width={logo.includes("zoom") ? 37 : 34} height={34} className="max-h-9 object-contain" /></span>)}</div><div><h2 className="font-bold">{tool.name}</h2><p className="mt-1 text-xs leading-4 text-[#526180]">{tool.description}</p></div></div><div className="mt-auto flex items-end justify-between pt-4"><span className="rounded bg-[#eeebff] px-2 py-0.5 text-[11px] font-semibold text-[#5145ed]">{isConnected ? "Connected" : "Optional"}</span><button type="button" disabled={busy !== null || isConnected} onClick={() => connect(tool.key)} className="rounded-lg border border-[#5145ed] px-4 py-1 text-xs font-semibold text-[#5145ed] disabled:opacity-50">{busy === tool.key ? "Opening…" : isConnected ? "Connected" : "Connect"}</button></div></article>; })}</div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#e0e4f2] pt-4"><p className="text-xs text-[#526180]">♧ &nbsp;You can connect or disconnect tools later in Integrations.</p><div className="flex items-center gap-4"><Link href="/projects" className="rounded-lg bg-[#5145ed] px-6 py-2.5 text-sm font-semibold text-white">Continue →</Link><Link href="/projects" className="text-xs font-semibold text-[#5145ed]">Skip for now</Link></div></div>
    </section></div>
  </main>;
}
