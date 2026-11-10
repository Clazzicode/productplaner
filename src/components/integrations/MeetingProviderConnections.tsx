"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

type Provider = "google_calendar" | "zoom" | "notion";
type Connection = { provider: Provider; connected: boolean; accountEmail: string | null; accountLabel?: string | null };
const cards = [
  { key: "google_meet", name: "Google Meet", logo: "/brands/google-meet.svg", detail: "Create video calls and send invitations through your Google Calendar.", action: "google_calendar" },
  { key: "google_calendar", name: "Google Calendar", logo: "/brands/google-calendar.svg", detail: "View your schedule and create calendar invitations for demos.", action: "google_calendar" },
  { key: "zoom", name: "Zoom", logo: "/brands/zoom-logo.png", detail: "Schedule Zoom calls and keep their details with each demo.", action: "zoom" },
  { key: "notion", name: "Notion", logo: "/brands/notion.svg", detail: "Import shared notes and reference pages into meeting records.", action: "notion" },
] as const;

export default function MeetingProviderConnections({ canManage, connections }: { canManage: boolean; connections: Connection[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  const byProvider = Object.fromEntries(connections.map((connection) => [connection.provider, connection])) as Partial<Record<Provider, Connection>>;
  async function act(provider: Provider, action: "connect" | "disconnect") {
    setBusy(provider); setError("");
    const path = provider === "notion" ? "/api/notion" : `/api/meeting-providers/${provider}`;
    const result = await apiFetch<{ authorizationUrl?: string }>(path, { method: "POST", body: { action } });
    setBusy(null);
    if (!result.ok) { setError(result.error ?? "Connection failed."); return; }
    if (result.data?.authorizationUrl) window.location.assign(result.data.authorizationUrl);
    else router.refresh();
  }
  return <section aria-labelledby="personal-connections" className="rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="personal-connections" className="text-xl font-bold text-[#0b1735]">Your connections</h2><p className="mt-1 text-sm text-[#64708c]">Each connection belongs to your account. Google Meet and Calendar use the same Google authorization.</p></div><span className="rounded-full bg-[#eeebff] px-3 py-1 text-xs font-semibold text-[#5145ed]">Personal integrations</span></div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">{cards.map((card) => {
      const connection = byProvider[card.action];
      const connected = !!connection?.connected;
      const account = connection?.accountLabel || connection?.accountEmail;
      return <article key={card.key} className="flex min-h-52 flex-col rounded-xl border border-[#d9def0] bg-[#fdfdff] p-4 shadow-[0_2px_8px_rgba(20,31,75,.04)] sm:p-5">
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-xl border border-[#eceafa] bg-white"><Image src={card.logo} alt="" width={card.key === "zoom" ? 39 : 34} height={34} className="max-h-9 object-contain" /></span><h3 className="text-base font-bold text-[#0b1735]">{card.name}</h3></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${connected ? "bg-emerald-50 text-emerald-700" : "bg-[#f0efff] text-[#5145ed]"}`}>{connected ? "✓ Connected" : "Not connected"}</span></div>
        <p className="mt-3 text-sm leading-5 text-[#64708c]">{card.detail}</p>
        <p className="mt-2 break-all text-xs text-[#4f5c78]">{account ? `Account: ${account}` : card.key === "google_meet" ? "Connect Google Calendar to use Meet." : "No account connected"}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5"><span className="text-xs text-[#7b86a0]">{card.key === "google_meet" ? "Shared Google connection" : "Your account"}</span>{canManage && <button type="button" disabled={busy !== null} onClick={() => act(card.action, connected ? "disconnect" : "connect")} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${connected ? "border border-[#d9def0] bg-white text-[#34415f]" : "bg-[#5145ed] text-white"}`}>{busy === card.action ? "Working…" : connected ? "Disconnect" : `Connect ${card.name}`}</button>}</div>
      </article>;
    })}</div>
    {(params.get("connection") || params.get("notion")) && <p role="status" className="mt-4 text-sm text-[#34415f]">Connection {(params.get("connection") || params.get("notion"))?.replaceAll("_", " ")}.</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
  </section>;
}
