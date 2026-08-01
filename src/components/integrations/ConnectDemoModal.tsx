"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { apiFetch } from "@/lib/clientApi";
import type { HubInitiative, HubProvider } from "./IntegrationsHub";

/**
 * The §2.6 demo connection flow: workspace values → save → Demo Connected.
 * No real OAuth, no credentials — a realistic field-mapping UI over local state.
 */
export default function ConnectDemoModal(props: {
  provider: HubProvider;
  initiatives: HubInitiative[];
  defaults: {
    workspaceName: string;
    workspaceUrl: string;
    projectKey: string;
    projectName: string;
    initiativeId: string | null;
    syncDirection: string;
    boardType: string;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { provider } = props;
  const [form, setForm] = useState(props.defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isExecution = provider.category === "execution";

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/integrations/${provider.key}`, {
      method: "POST",
      body: {
        action: "connect",
        initiativeId: form.initiativeId,
        workspaceName: form.workspaceName,
        workspaceUrl: form.workspaceUrl,
        projectKey: form.projectKey,
        projectName: form.projectName,
        settings: { syncDirection: form.syncDirection, boardType: form.boardType },
      },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save the demo connection.");
      return;
    }
    props.onSaved();
  };

  const input = "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <Modal open title={`Connect ${provider.name} (demo)`} onClose={props.onClose}>
      <p className="text-sm text-neutral-500">
        Demo mode — values are stored locally, nothing leaves this prototype. {provider.description}
      </p>
      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium">
          Scope
          <select
            value={form.initiativeId ?? ""}
            onChange={(e) => setForm({ ...form, initiativeId: e.target.value || null })}
            className={input}
          >
            <option value="">Organization-wide</option>
            {props.initiatives.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Workspace name
          <input
            value={form.workspaceName}
            onChange={(e) => setForm({ ...form, workspaceName: e.target.value })}
            placeholder={`e.g. acme.${provider.key}.demo`}
            className={input}
          />
        </label>
        <label className="block text-sm font-medium">
          Workspace URL <span className="font-normal text-neutral-400">(optional)</span>
          <input
            value={form.workspaceUrl}
            onChange={(e) => setForm({ ...form, workspaceUrl: e.target.value })}
            placeholder={`https://acme.${provider.key === "azure_devops" ? "visualstudio.com" : `${provider.key}.com`}`}
            className={input}
          />
        </label>
        {isExecution && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Project key
                <input
                  value={form.projectKey}
                  onChange={(e) => setForm({ ...form, projectKey: e.target.value.toUpperCase() })}
                  placeholder="PROJ"
                  className={input}
                />
              </label>
              <label className="block text-sm font-medium">
                Project name
                <input
                  value={form.projectName}
                  onChange={(e) => setForm({ ...form, projectName: e.target.value })}
                  placeholder="Product Platform"
                  className={input}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Board type
                <select
                  value={form.boardType}
                  onChange={(e) => setForm({ ...form, boardType: e.target.value })}
                  className={input}
                >
                  <option value="scrum">Scrum</option>
                  <option value="kanban">Kanban</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                Sync direction
                <select
                  value={form.syncDirection}
                  onChange={(e) => setForm({ ...form, syncDirection: e.target.value })}
                  className={input}
                >
                  <option value="push">Push only (MVP)</option>
                  <option value="bidirectional">Bidirectional (simulated)</option>
                </select>
              </label>
            </div>
            <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
              <p className="font-semibold text-neutral-700">Field mapping (demo)</p>
              <p className="mt-1">
                Epic → {provider.name} Epic · Story → {provider.name}{" "}
                {provider.key === "azure_devops" ? "User Story" : "Story"} · Acceptance criteria →
                description checklist · Sprint → {provider.key === "azure_devops" ? "Iteration" : "Sprint"}
              </p>
            </div>
          </>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-3">
        <button onClick={props.onClose} className="text-sm text-neutral-500 hover:text-neutral-800">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy || (isExecution && form.projectKey.trim().length === 0)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save demo connection"}
        </button>
      </div>
    </Modal>
  );
}
