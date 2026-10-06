"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { ButtonLoader } from "@/components/ui/loading";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";

export interface AvailablePhase { phaseNumber: number; title: string; }
type Cadence = "weekly" | "biweekly" | "every_three_weeks" | "monthly" | "quarterly" | "custom";

export default function CreateReleaseForm(props: { initiativeId: string; availablePhases: AvailablePhase[]; currentCadence?: string; currentCustomCadence?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cadence, setCadence] = useState<Cadence>((props.currentCadence as Cadence) || "monthly");
  const [customCadence, setCustomCadence] = useState(props.currentCustomCadence ?? "");
  const [targetDate, setTargetDate] = useState("");
  const { run, loading: busy, error } = useAsyncAction((body: { cadence: Cadence; customCadence: string; targetDate: string }) =>
    apiFetch(`/api/initiatives/${props.initiativeId}/releases`, { method: "POST", body }),
  );

  if (props.availablePhases.length === 0) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !targetDate) return;
    const created = await run({ cadence, customCadence: cadence === "custom" ? customCadence : "", targetDate });
    if (!created) return;
    setOpen(false); setTargetDate(""); router.refresh();
  };

  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">Create Release</button>;

  return <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
    <h3 className="text-sm font-semibold text-indigo-900">Create a release</h3>
    <p className="mt-1 text-xs text-indigo-700">Set the team&apos;s release rhythm and the target date. Guided Planning connects the release to the next roadmap group automatically.</p>
    <div className="mt-3 space-y-3">
      <label className="block text-xs font-medium text-neutral-600">How often do you release?
        <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
          <option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="every_three_weeks">Every three weeks</option>
          <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="custom">Other cadence</option>
        </select>
      </label>
      {cadence === "custom" && <label className="block text-xs font-medium text-neutral-600">Custom cadence
        <input required value={customCadence} onChange={(e) => setCustomCadence(e.target.value)} maxLength={120} placeholder="e.g. Every six weeks" className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm" />
      </label>}
      <label className="block text-xs font-medium text-neutral-600">Target release date
        <input required type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm" />
      </label>
    </div>
    {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    <div className="mt-4 flex justify-end gap-2">
      <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-white disabled:opacity-50">Cancel</button>
      <ButtonLoader type="submit" loading={busy} loadingLabel="Creating">Create Release</ButtonLoader>
    </div>
  </form>;
}
