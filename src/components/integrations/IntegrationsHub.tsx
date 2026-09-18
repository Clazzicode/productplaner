"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/clientApi";
import { ButtonLoader } from "@/components/ui/loading";
import ConnectDemoModal from "./ConnectDemoModal";
import SyncLogPanel, { type SyncLogView } from "./SyncLogPanel";

export interface HubProvider {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string;
  isFeatured: boolean;
  capabilities: string[];
}

export interface HubConnection {
  id: string;
  providerId: string;
  status: string;
  isEnabled: boolean;
  initiativeId: string | null;
  initiativeName: string | null;
  workspaceName: string | null;
  projectKey: string | null;
  lastSyncAt: string | null;
  lastSyncMessage: string | null;
  logs: SyncLogView[];
}

export interface HubInitiative {
  id: string;
  name: string;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "execution", label: "Execution" },
  { key: "roadmap", label: "Roadmap" },
  { key: "documentation", label: "Documentation" },
  { key: "design", label: "Design" },
  { key: "communication", label: "Communication" },
  { key: "source_control", label: "Source Control" },
];

// Clean branded placeholder tiles — real brand assets aren't bundled (spec §2.5 fallback).
const PROVIDER_BRAND: Record<string, string> = {
  jira: "#2684FF",
  aha: "#F5325B",
  azure_devops: "#0078D4",
  confluence: "#1868DB",
  notion: "#111111",
  slack: "#611F69",
  figma: "#A259FF",
  github: "#181717",
};

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  available: { label: "Available", variant: "neutral" },
  needs_configuration: { label: "Needs configuration", variant: "amber" },
  demo_connected: { label: "Connected", variant: "indigo" },
  sync_ready: { label: "Sync ready", variant: "indigo" },
  sync_complete: { label: "Sync complete", variant: "emerald" },
  demo_error: { label: "Error", variant: "red" },
};

export default function IntegrationsHub(props: {
  providers: HubProvider[];
  connections: HubConnection[];
  initiatives: HubInitiative[];
  defaultInitiativeId: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [modalProvider, setModalProvider] = useState<HubProvider | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openLogs, setOpenLogs] = useState<string | null>(null);

  const connectionFor = (providerId: string) =>
    props.connections.find((c) => c.providerId === providerId) ?? null;

  const visible = props.providers.filter((p) => {
    if (category !== "all" && p.category !== category) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  });

  const act = async (provider: HubProvider, body: Record<string, unknown>, doing: string) => {
    setBusyKey(`${provider.key}:${doing}`);
    setError(null);
    setToast(null);
    const res = await apiFetch<{ message?: string }>(`/api/integrations/${provider.key}`, {
      method: "POST",
      body,
    });
    setBusyKey(null);
    if (!res.ok) {
      setError(res.error ?? "The integration action failed.");
      return;
    }
    if (res.data?.message) setToast(res.data.message);
    router.refresh();
  };

  return (
    <div>
      {/* Search + category pills */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-white p-3 shadow-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search integrations…"
          className="w-64 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                category === c.key
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {toast && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{toast}</p>
      )}
      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>
      )}

      {/* Cards */}
      <div className="mt-5 space-y-3">
        {visible.map((provider) => {
          const conn = connectionFor(provider.id);
          const status = conn && conn.isEnabled ? conn.status : "available";
          const meta = STATUS_META[status] ?? STATUS_META.available;
          const brand = PROVIDER_BRAND[provider.key] ?? "#4f46e5";
          const connected = conn != null && conn.isEnabled && status !== "available";
          const syncable = connected && status !== "needs_configuration";
          const busy = (k: string) => busyKey === `${provider.key}:${k}`;

          return (
            <div key={provider.id} className={`rounded-xl border bg-white p-5 shadow-[0_8px_28px_rgba(46,71,125,0.06)] ${provider.isFeatured ? "border-indigo-200 ring-1 ring-indigo-50" : "border-border-subtle"}`}>
              <div className="flex flex-wrap items-start gap-4">
                {/* Left: logo + identity */}
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    aria-hidden
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
                    style={{ backgroundColor: brand }}
                  >
                    {provider.key === "jira" ? "◆" : provider.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {provider.name}
                      <span className="text-xs font-medium capitalize text-neutral-400">
                        {provider.category.replace("_", " ")}
                      </span>
                      {provider.isFeatured && <Badge variant="indigo">Featured</Badge>}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-500">{provider.description}</p>
                    <p className="mt-1 text-xs text-neutral-400">
                      {provider.capabilities.join(" · ")}
                    </p>
                    {conn && connected && (
                      <p className="mt-1 text-xs text-neutral-400">
                        {conn.workspaceName && <>Workspace: {conn.workspaceName} · </>}
                        {conn.projectKey && <>Project {conn.projectKey} · </>}
                        Scope: {conn.initiativeName ?? "organization-wide"}
                        {conn.lastSyncAt && (
                          <> · Last sync {new Date(conn.lastSyncAt).toLocaleString()}</>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* Middle: preview placeholder tile */}
                <div
                  aria-hidden
                  className="hidden h-16 w-28 shrink-0 rounded-lg lg:block"
                  style={{
                    background: `linear-gradient(135deg, ${brand}22, ${brand}55)`,
                  }}
                >
                  <div className="flex h-full flex-col justify-center gap-1 px-3">
                    <div className="h-1.5 w-3/4 rounded bg-white/70" />
                    <div className="h-1.5 w-1/2 rounded bg-white/50" />
                    <div className="h-1.5 w-2/3 rounded bg-white/60" />
                  </div>
                </div>

                {/* Right: status + actions */}
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {!connected && (
                      <ActionButton
                        primary
                        onClick={() =>
                          conn && !conn.isEnabled
                            ? act(provider, { action: "reconnect", connectionId: conn.id }, "reconnect")
                            : setModalProvider(provider)
                        }
                        busy={busy("reconnect")}
                        loadingLabel={conn && !conn.isEnabled ? "Reconnecting" : "Connecting"}
                      >
                        {conn && !conn.isEnabled ? "Reconnect" : "Connect"}
                      </ActionButton>
                    )}
                    {connected && (
                      <>
                        <ActionButton onClick={() => setModalProvider(provider)}>
                          {provider.category === "execution" ? "Configure / mapping" : "Configure"}
                        </ActionButton>
                        {syncable && (
                          <ActionButton
                            primary
                            onClick={() => act(provider, { action: "sync", connectionId: conn!.id }, "sync")}
                            busy={busy("sync")}
                            loadingLabel="Syncing"
                          >
                            Sync now
                          </ActionButton>
                        )}
                        <ActionButton
                          onClick={() => act(provider, { action: "disconnect", connectionId: conn!.id }, "disconnect")}
                          busy={busy("disconnect")}
                          loadingLabel="Disconnecting"
                        >
                          Disconnect
                        </ActionButton>
                      </>
                    )}
                    {conn && conn.logs.length > 0 && (
                      <ActionButton
                        onClick={() => setOpenLogs(openLogs === conn.id ? null : conn.id)}
                      >
                        {openLogs === conn.id ? "Hide log" : `Sync log (${conn.logs.length})`}
                      </ActionButton>
                    )}
                  </div>
                </div>
              </div>
              {conn && openLogs === conn.id && <SyncLogPanel logs={conn.logs} />}
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
            No integrations match “{search}”.
          </p>
        )}
      </div>

      {modalProvider && (
        <ConnectDemoModal
          provider={modalProvider}
          initiatives={props.initiatives}
          defaults={(() => {
            const existing = connectionFor(modalProvider.id);
            return {
              workspaceName: existing?.workspaceName ?? "",
              workspaceUrl: "",
              projectKey: existing?.projectKey ?? "",
              projectName: "",
              initiativeId: existing?.initiativeId ?? props.defaultInitiativeId,
              syncDirection: "push",
              boardType: "scrum",
            };
          })()}
          onClose={() => setModalProvider(null)}
          onSaved={() => {
            setModalProvider(null);
            setToast(`${modalProvider.name} connection saved.`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ActionButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  busy?: boolean;
  loadingLabel?: string;
}) {
  return (
    <ButtonLoader
      onClick={props.onClick}
      loading={!!props.busy}
      loadingLabel={props.loadingLabel}
      variant={props.primary ? "primary" : "secondary"}
    >
      {props.children}
    </ButtonLoader>
  );
}
