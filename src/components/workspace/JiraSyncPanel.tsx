"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

/** FR-14 stub: demo-mode sync — writes fake DEMO-n keys locally, no HTTP
 * leaves the machine. It is a sync, not a handoff: the prototype stays here. */
export default function JiraSyncPanel(props: {
  initiativeId: string;
  status: string;
  lastSyncedAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"connect" | "sync" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const run = async (action: "connect" | "sync") => {
    setBusy(action);
    setError(null);
    const res = await apiFetch<{ pushed?: number; projectKey?: string }>(
      `/api/initiatives/${props.initiativeId}/sync/jira`,
      { method: "POST", body: { action } },
    );
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? "Sync failed.");
      return;
    }
    if (action === "sync" && res.data?.pushed !== undefined) {
      setLastResult(`Pushed ${res.data.pushed} items to ${res.data.projectKey} (demo)`);
    }
    router.refresh();
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2 text-xs">
      <span
        className={`rounded-full px-2.5 py-1 font-medium ${
          props.status === "connected"
            ? "bg-emerald-100 text-emerald-800"
            : "bg-neutral-100 text-neutral-500"
        }`}
      >
        Jira: {props.status === "connected" ? "connected (demo)" : "not connected"}
      </span>
      {props.status !== "connected" ? (
        <button
          onClick={() => run("connect")}
          disabled={busy !== null}
          className="rounded-lg border border-indigo-300 px-3 py-1 font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
        >
          {busy === "connect" ? "Connecting…" : "Connect (demo)"}
        </button>
      ) : (
        <button
          onClick={() => run("sync")}
          disabled={busy !== null}
          className="rounded-lg bg-indigo-600 px-3 py-1 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy === "sync" ? "Syncing…" : "Sync now"}
        </button>
      )}
      {props.lastSyncedAt && (
        <span className="text-neutral-400">
          Last synced {new Date(props.lastSyncedAt).toLocaleString()}
        </span>
      )}
      {lastResult && <span className="text-emerald-700">{lastResult}</span>}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
