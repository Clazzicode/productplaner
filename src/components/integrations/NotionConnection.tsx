"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

export default function NotionConnection({ canManage, connected, accountLabel }: { canManage: boolean; connected: boolean; accountLabel: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act() {
    setBusy(true); setError("");
    const result = await apiFetch<{ authorizationUrl?: string }>("/api/notion", { method: "POST", body: { action: connected ? "disconnect" : "connect" } });
    setBusy(false);
    if (!result.ok) { setError(result.error ?? "Notion connection failed."); return; }
    if (result.data?.authorizationUrl) window.location.assign(result.data.authorizationUrl);
    else router.refresh();
  }
  return <section className="rounded-xl border border-indigo-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Notion</h2><p className="mt-1 text-sm text-slate-600">Connect your Notion workspace to import shared page text into a Clarivia meeting record.{accountLabel ? ` Connected workspace: ${accountLabel}.` : ""}</p></div><span className={`text-xs font-semibold ${connected ? "text-emerald-700" : "text-slate-500"}`}>{connected ? "Connected" : "Not connected"}</span></div>
    {canManage && <button type="button" disabled={busy} onClick={act} className="mt-3 rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">{busy ? "Working…" : connected ? "Disconnect Notion" : "Connect Notion"}</button>}
    {params.get("notion") && <p role="status" className="mt-3 text-sm">Notion connection {params.get("notion")?.replaceAll("_", " ")}.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
