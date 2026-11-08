"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

export default function RefreshBar(props: {
  initiativeId: string;
  manualReleaseCount?: number;
  manualSprintCount?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function propose() {
    setBusy(true); setError(null);
    const response = await apiFetch<{ proposalId: string }>(`/api/initiatives/${props.initiativeId}/regeneration-proposals`, { method: "POST" });
    setBusy(false);
    if (!response.ok) { setError(response.error ?? "Could not create a review proposal."); return; }
    router.push(`/initiatives/${props.initiativeId}/workspace/regeneration`);
    router.refresh();
  }
  return <div className="no-print mt-3 flex flex-wrap items-center gap-3 text-sm">
    <button disabled={busy} onClick={() => void propose()} className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 disabled:opacity-50">{busy ? "Preparing proposal…" : "Propose regeneration"}</button>
    <Link className="text-indigo-700 underline" href={`/initiatives/${props.initiativeId}/workspace/regeneration`}>Review proposals</Link>
    <span className="text-neutral-600">Edits, identities, delivery commitments and external links are preserved.</span>
    {error && <p role="alert" className="w-full text-red-700">{error}</p>}
  </div>;
}
