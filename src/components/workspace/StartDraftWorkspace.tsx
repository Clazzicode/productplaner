"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

export default function StartDraftWorkspace({ initiativeId }: { initiativeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setBusy(true);
    const result = await apiFetch(`/api/planning-drafts/${initiativeId}/workspace`, { method: "POST" });
    setBusy(false);
    if (!result.ok) { setError(result.error ?? "Could not initialize the workspace."); return; }
    router.refresh();
  }
  return <div><p>Create empty planning containers. This generates no stories, estimates, dates or commitments.</p><button disabled={busy} onClick={() => void start()} className="mt-3 rounded bg-indigo-700 px-4 py-2 text-white">{busy ? "Opening…" : "Start empty planning workspace"}</button>{error && <p role="alert">{error}</p>}</div>;
}
