"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { apiFetch } from "@/lib/clientApi";

export default function AnthropicKeySettings(props: { hasKey: boolean; last4: string | null }) {
  const [hasKey, setHasKey] = useState(props.hasKey);
  const [last4, setLast4] = useState(props.last4);
  const [editing, setEditing] = useState(!props.hasKey);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ last4: string }>("/api/account/anthropic-key", {
      method: "PATCH",
      body: { apiKey },
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not save your key.");
      return;
    }
    setHasKey(true);
    setLast4(res.data.last4);
    setApiKey("");
    setEditing(false);
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/account/anthropic-key", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not remove your key.");
      return;
    }
    setHasKey(false);
    setLast4(null);
    setEditing(true);
  };

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-md">
      <h2 className="text-lg font-semibold text-text-primary">Anthropic API key</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
        Used only for your own document imports on Intake (
        <span className="italic">Import from a document</span>) — never shared with any other
        account. Get a key at{" "}
        <span className="font-medium">console.anthropic.com/settings/keys</span>.
      </p>

      {hasKey && !editing && (
        <div className="mt-5 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3.5">
          <p className="text-sm text-emerald-800">
            Connected{last4 ? ` — ending in •••• ${last4}` : ""}
          </p>
          <div className="flex gap-4 text-xs font-semibold">
            <button onClick={() => setEditing(true)} className="text-accent hover:underline">
              Replace
            </button>
            <button onClick={() => void remove()} disabled={busy} className="text-red-600 hover:underline">
              Remove
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="mt-5">
          <label className="block text-sm font-medium text-text-primary">
            API key
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-…"
              className="mt-1.5"
              autoFocus
            />
          </label>
          <div className="mt-4 flex justify-end gap-3">
            {hasKey && (
              <Button variant="ghost" onClick={() => { setEditing(false); setApiKey(""); setError(null); }}>
                Cancel
              </Button>
            )}
            <Button onClick={() => void save()} disabled={busy || apiKey.trim().length < 10}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
