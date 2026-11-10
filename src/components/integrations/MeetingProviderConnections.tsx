"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

type Provider = "google_calendar" | "zoom";
const labels: Record<Provider, string> = { google_calendar: "Google Calendar", zoom: "Zoom" };

export default function MeetingProviderConnections({ canManage, connections }: { canManage: boolean; connections: { provider: Provider; connected: boolean; accountEmail: string | null }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  async function act(provider: Provider, action: "connect" | "disconnect") {
    setBusy(provider); setError("");
    const result = await apiFetch<{ authorizationUrl?: string }>(`/api/meeting-providers/${provider}`, { method: "POST", body: { action } });
    setBusy(null);
    if (!result.ok) { setError(result.error ?? "Connection failed."); return; }
    if (action === "connect" && result.data?.authorizationUrl) window.location.assign(result.data.authorizationUrl);
    else router.refresh();
  }
  const outcome = params.get("connection");
  return <section className="rounded-xl border border-indigo-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-semibold text-slate-900">Your meeting connections</h2>
    <p className="mt-1 text-sm text-slate-600">Google Meet uses your Google Calendar connection to create a call and invite guests. Zoom connects separately; its invitations also use your Google Calendar.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Google Meet</h3><span className={`text-xs font-semibold ${connections[0]?.connected ? "text-emerald-700" : "text-slate-500"}`}>{connections[0]?.connected ? "Connected" : "Not connected"}</span></div><p className="mt-2 text-sm text-slate-600">{connections[0]?.connected ? `Uses ${connections[0].accountEmail ?? "your Google account"} to create Meet links.` : "Connect Google Calendar to use Meet."}</p></div>{connections.map(item => <div key={item.provider} className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{labels[item.provider]}</h3><span className={`text-xs font-semibold ${item.connected ? "text-emerald-700" : "text-slate-500"}`}>{item.connected ? "Connected" : "Not connected"}</span></div>
      {item.accountEmail && <p className="mt-2 break-all text-sm text-slate-600">{item.accountEmail}</p>}
      {canManage && <button type="button" disabled={busy !== null} onClick={() => act(item.provider, item.connected ? "disconnect" : "connect")} className="mt-3 rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">{busy === item.provider ? "Working…" : item.connected ? "Disconnect" : `Connect ${labels[item.provider]}`}</button>}
    </div>)}</div>
    {outcome && <p role="status" className="mt-3 text-sm text-slate-700">Connection {outcome.replaceAll("_", " ")}.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
