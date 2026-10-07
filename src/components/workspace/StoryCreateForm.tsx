"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

export default function StoryCreateForm({ initiativeId, epicId }: { initiativeId: string; epicId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [sourceType, setSourceType] = useState<"manual" | "jira">("manual");
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [externalRef, setExternalRef] = useState("");
  async function save() {
    setBusy(true); setError("");
    const result = await apiFetch(`/api/initiatives/${initiativeId}/stories`, { method: "POST", body: { epicId, title, body, sourceType, externalRef: externalRef || null, points: null } });
    setBusy(false); if (!result.ok) return setError(result.error ?? "Could not create the story.");
    setOpen(false); setTitle(""); setBody(""); setExternalRef(""); router.refresh();
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-3 text-xs font-semibold text-indigo-700">+ Add or import story</button>;
  return <div className="mt-3 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
    <div className="flex gap-2"><button type="button" onClick={() => setSourceType("manual")} className={`rounded px-2 py-1 text-xs ${sourceType === "manual" ? "bg-indigo-600 text-white" : "bg-white"}`}>Create manually</button><button type="button" onClick={() => setSourceType("jira")} className={`rounded px-2 py-1 text-xs ${sourceType === "jira" ? "bg-indigo-600 text-white" : "bg-white"}`}>Import Jira reference</button></div>
    {sourceType === "jira" && <input aria-label="Jira story key" value={externalRef} onChange={e => setExternalRef(e.target.value)} placeholder="Jira key, for example GP-123" className="w-full rounded border p-2 text-sm" />}
    <input aria-label="Story title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Story title" className="w-full rounded border p-2 text-sm" />
    <textarea aria-label="Story outcome" value={body} onChange={e => setBody(e.target.value)} placeholder="As a …, I want …, so that …" className="w-full rounded border p-2 text-sm" rows={3} />
    {error && <p className="text-xs text-red-700">{error}</p>}
    <div className="flex gap-2"><button type="button" disabled={busy || title.trim().length < 3 || !body.trim()} onClick={save} className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : sourceType === "jira" ? "Import story" : "Create story"}</button><button type="button" onClick={() => setOpen(false)} className="text-xs">Cancel</button></div>
  </div>;
}
