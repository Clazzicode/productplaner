"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

export default function NewInitiativeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await apiFetch<{ initiativeId: string }>("/api/initiatives", {
      method: "POST",
      body: { name, description },
    });
    setSubmitting(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not create the initiative.");
      return;
    }
    router.push(`/initiatives/${res.data.initiativeId}/intake`);
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <label className="block text-sm font-medium">
        What should we call this initiative?
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Customer Self-Service Portal"
          className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none"
          autoFocus
        />
      </label>
      <label className="mt-5 block text-sm font-medium">
        Describe the idea in plain language <span className="font-normal text-neutral-400">(optional)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A sentence or two — the guided intake will draw the details out of you."
          rows={3}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none"
        />
      </label>

      <div className="mt-6 rounded-xl bg-indigo-50 p-4 text-sm">
        <p className="font-semibold text-indigo-900">Methodology: Hybrid waterfall</p>
        <p className="mt-1 text-indigo-800">
          Planning layers (roadmap → stories) lock in strict waterfall sequence. Execution
          layers (sprints, releases, capacity) stay flexible in Agile cadence beneath them.
        </p>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={submitting || name.trim().length < 3}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Continue to guided intake →"}
        </button>
      </div>
    </form>
  );
}
