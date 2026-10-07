"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";
export default function StorySuggestionButton({ initiativeId, featureId, featureTitle }: { initiativeId: string; featureId: string; featureTitle?: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function run() { setBusy(true); setMessage(""); const result = await apiFetch(`/api/initiatives/${initiativeId}/ai-assist/content`, { method: "POST", body: { featureId } }); setBusy(false); setMessage(result.ok ? "Suggestion ready below for review." : result.error ?? "Could not generate suggestions."); router.refresh(); }
  return <div className="mt-2"><button type="button" onClick={run} disabled={busy} aria-label={featureTitle ? `Prepare ${featureTitle} for refinement with AI` : undefined} className="rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 disabled:opacity-50">{busy ? "Reviewing feature…" : featureTitle ? `AI review: ${featureTitle}` : "Suggest stories and criteria with AI"}</button>{message && <p className="mt-1 text-xs text-neutral-500">{message}</p>}</div>;
}
