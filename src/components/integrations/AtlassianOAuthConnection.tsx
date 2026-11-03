"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/clientApi";

type Connection = {
  status: "connected" | "reconnect_required";
  resources: Array<{ id: string; name: string; host: string }>;
  grantedScopes: string[];
  accessTokenExpiresAt: string;
  connectedAt: string;
};

type StatusResult = { connection: Connection | null };
type StartResult = { authorizationUrl: string };

const CALLBACK_MESSAGES: Record<string, { text: string; error?: boolean }> = {
  connected: { text: "Atlassian is connected to this workspace with read-only Jira permissions." },
  cancelled: { text: "Atlassian authorization was cancelled." },
  invalid_state: { text: "The authorization expired or could not be verified. Please connect again.", error: true },
  no_sites: { text: "No Jira sites were available to Clarivia for the granted account.", error: true },
  permissions_required: { text: "The authorization did not grant the required read-only Jira permissions. Reconnect and approve the requested access.", error: true },
  setup_required: { text: "The server is missing its Atlassian token-encryption key. Ask an administrator to finish the secure connection setup.", error: true },
  failed: { text: "The connection could not be completed. Please try again or contact your administrator.", error: true },
};

export default function AtlassianOAuthConnection(props: { canManage: boolean }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async (callbackResult?: string | null) => {
    const response = await apiFetch<StatusResult>("/api/atlassian/oauth/status");
    setLoading(false);
    if (!response.ok) {
      setMessage({ text: response.error ?? "Could not load Atlassian connection status.", error: true });
      return;
    }
    setConnection(response.data?.connection ?? null);
    if (callbackResult) setMessage(CALLBACK_MESSAGES[callbackResult] ?? { text: "Atlassian connection status updated." });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("atlassian");
    if (result) {
      params.delete("atlassian");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
    const timer = window.setTimeout(() => { void load(result); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const connect = async () => {
    setBusy(true);
    setMessage(null);
    const response = await apiFetch<StartResult>("/api/atlassian/oauth/start", { method: "POST" });
    if (!response.ok || !response.data?.authorizationUrl) {
      setBusy(false);
      setMessage({ text: response.error ?? "Could not start the Atlassian connection.", error: true });
      return;
    }
    try {
      const destination = new URL(response.data.authorizationUrl);
      if (destination.origin !== "https://auth.atlassian.com") throw new Error("Invalid authorization destination");
      window.location.assign(destination.toString());
    } catch {
      setBusy(false);
      setMessage({ text: "The Atlassian authorization destination was invalid.", error: true });
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Atlassian from this Clarivia workspace? This removes Clarivia's stored credentials.")) return;
    setBusy(true);
    setMessage(null);
    const response = await apiFetch<{ disconnected: boolean }>("/api/atlassian/oauth/disconnect", { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      setMessage({ text: response.error ?? "Could not disconnect Atlassian.", error: true });
      return;
    }
    setConnection(null);
    setMessage({ text: "Atlassian has been disconnected from this Clarivia workspace." });
  };

  const verify = async () => {
    setBusy(true);
    setMessage(null);
    const response = await apiFetch<{ verified: boolean; siteCount?: number }>("/api/atlassian/oauth/verify", { method: "POST" });
    setBusy(false);
    if (!response.ok) {
      setMessage({ text: response.error ?? "Could not verify Atlassian permissions.", error: true });
      await load();
      return;
    }
    setMessage({ text: `Atlassian connection verified. ${response.data?.siteCount ?? 0} Jira site(s) are available with read-only access.` });
    await load();
  };

  const hasRequiredScopes = connection?.grantedScopes.includes("read:jira-work")
    && connection.grantedScopes.includes("offline_access");

  return (
    <section aria-labelledby="atlassian-connection-title" className="rounded-2xl border border-border-subtle bg-white p-5 shadow-[0_8px_28px_rgba(46,71,125,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Secure connection</p>
          <h2 id="atlassian-connection-title" className="mt-1 text-lg font-semibold text-text-primary">Atlassian / Jira</h2>
          <p className="mt-1 max-w-3xl text-sm text-text-secondary">
            Connect your workspace using Atlassian OAuth. Clarivia requests read-only Jira access; it cannot create, edit, or delete Jira data through this connection.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connection?.status === "connected" && hasRequiredScopes ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
          {loading ? "Checking status" : connection?.status === "connected" && hasRequiredScopes ? "Connected · read-only" : connection ? "Reconnect required" : "Not connected"}
        </span>
      </div>

      {connection && (
        <div className="mt-4 space-y-3 rounded-xl bg-neutral-50 p-4 text-sm">
          <div>
            <p className="font-semibold text-text-primary">Atlassian sites authorized</p>
            {connection.resources.length ? (
              <ul className="mt-1 list-inside list-disc text-text-secondary">
                {connection.resources.map((resource) => <li key={resource.id}>{resource.name} <span className="text-neutral-400">({resource.host})</span></li>)}
              </ul>
            ) : <p className="mt-1 text-text-secondary">No available Jira sites.</p>}
          </div>
          <p className="text-xs text-text-secondary">
            Permissions: {connection.grantedScopes.join(", ") || "not reported"}. Access token expires {new Date(connection.accessTokenExpiresAt).toLocaleString()}.
          </p>
          <p className="text-xs text-text-secondary">Connected {new Date(connection.connectedAt).toLocaleString()}.</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {props.canManage && (
          <>
            <button type="button" onClick={() => void connect()} disabled={busy || loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? "Working…" : connection ? "Reconnect Atlassian" : "Connect Atlassian"}
            </button>
            {connection && <button type="button" onClick={() => void disconnect()} disabled={busy} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">Disconnect</button>}
            {connection && <button type="button" onClick={() => void verify()} disabled={busy} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">{busy ? "Checking…" : "Check permissions"}</button>}
          </>
        )}
        {!props.canManage && <p className="text-xs text-text-secondary">Only workspace owners and admins can manage this connection.</p>}
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        Disconnect removes Clarivia’s stored credentials. To revoke Atlassian’s authorization grant too, remove Clarivia from your Atlassian account’s Connected apps.
      </p>
      {message && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${message.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message.text}</p>}
    </section>
  );
}
