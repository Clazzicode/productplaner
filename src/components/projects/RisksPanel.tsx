"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { Badge, riskBadgeVariant } from "@/components/ui/Badge";
import { ButtonLoader } from "@/components/ui/loading";

export interface RiskView {
  id: string;
  description: string;
  severity: string;
  status: string;
}

const SEVERITY_OPTIONS = ["low", "medium", "high", "critical"] as const;

export default function RisksPanel(props: { projectId: string; risks: RiskView[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITY_OPTIONS)[number]>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/projects/${props.projectId}/risks`, {
      method: "POST",
      body: { description, severity },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not record the risk.");
      return;
    }
    setDescription("");
    setSeverity("medium");
    setAdding(false);
    router.refresh();
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800">Risks</h3>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            + Add risk
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 p-3">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the risk"
            className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as (typeof SEVERITY_OPTIONS)[number])}
            className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          >
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <ButtonLoader onClick={submit} loading={busy} loadingLabel="Saving" disabled={description.trim().length < 3}>
              Save
            </ButtonLoader>
          </div>
        </div>
      )}

      {props.risks.length === 0 && !adding ? (
        <p className="mt-2 text-xs text-neutral-400">No risks recorded yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {props.risks.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2">
              <p className="text-sm text-neutral-800">{r.description}</p>
              <Badge variant={riskBadgeVariant(r.severity)}>{r.severity}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
