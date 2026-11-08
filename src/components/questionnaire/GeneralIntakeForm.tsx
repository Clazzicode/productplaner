"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";
import { useUnsavedChanges } from "@/components/shell/unsavedChanges";
import { EMPTY_GENERAL_INTAKE, type GeneralIntakeValues } from "@/lib/planning/generalIntake";
import type { ExistingProjectSummary } from "./ProductDirectionBootstrap";

type Saved = { initiativeId: string; updatedAt: string; values?: GeneralIntakeValues };
const fieldClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export default function GeneralIntakeForm(props: { storageScope: string; project?: ExistingProjectSummary | null; detailed?: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<GeneralIntakeValues>(EMPTY_GENERAL_INTAKE);
  const [draftId, setDraftId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [saving, setSaving] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const currentValues = useRef(values);
  const version = useRef<string | null>(null);
  const inFlight = useRef<Promise<Saved | null> | null>(null);
  const storageKey = "clarivia:general-intake:" + props.storageScope + ":" + (props.project?.id ?? "new");

  useEffect(() => {
    let active = true;
    async function resume() {
      let stored: string | null = null;
      try { stored = localStorage.getItem(storageKey); } catch { /* Saving still works without browser storage. */ }
      if (stored) {
        const result = await apiFetch<Saved>("/api/planning-drafts/" + stored);
        if (!active) return;
        if (result.ok && result.data?.values) {
          currentValues.current = result.data.values; setValues(result.data.values); version.current = result.data.updatedAt;
          setSavedAt(result.data.updatedAt); setDraftId(stored); setLoaded(true); return;
        }
        // A temporary network failure must not replace a resumable draft with a new one.
        if (!result.ok && result.status !== 404) {
          setDraftId(stored); setError("Could not load your saved draft. Reload to resume it."); return;
        }
        setDraftId(stored); setLoaded(true); return;
      }
      if (active) {
        const id = crypto.randomUUID();
        try { localStorage.setItem(storageKey, id); } catch { /* No answers are stored in the browser. */ }
        setDraftId(id); setLoaded(true);
      }
    }
    void resume();
    return () => { active = false; };
  }, [storageKey]);

  const save = useCallback(async (): Promise<Saved | null> => {
    while (inFlight.current) await inFlight.current;
    const snapshot = currentValues.current;
    if (snapshot.name.trim().length < 3 || !draftId) return null;
    setSaving(true); setError("");
    const work = async () => {
      const result = await apiFetch<Saved>("/api/planning-drafts/" + draftId, { method: "PUT", body: {
        ...snapshot, projectId: props.project?.id ?? null, expectedUpdatedAt: version.current,
      } });
      if (!result.ok || !result.data) { setError(result.error ?? "Could not save your draft. Retry to resume the same draft."); return null; }
      version.current = result.data.updatedAt; setSavedAt(result.data.updatedAt);
      if (JSON.stringify(currentValues.current) === JSON.stringify(snapshot)) setDirty(false);
      try { localStorage.setItem(storageKey, draftId); } catch { /* Optional resume pointer only; no answers stored locally. */ }
      return result.data;
    };
    inFlight.current = work();
    try { return await inFlight.current; } finally { inFlight.current = null; setSaving(false); }
  }, [draftId, props.project?.id, storageKey]);

  useEffect(() => {
    if (!loaded || !dirty || continuing || values.name.trim().length < 3) return;
    const timer = window.setTimeout(() => { void save(); }, 1000);
    return () => window.clearTimeout(timer);
  }, [loaded, dirty, continuing, values, save]);

  const change = (key: keyof GeneralIntakeValues, value: string) => {
    const next = { ...currentValues.current, [key]: value };
    currentValues.current = next; setValues(next); setDirty(true);
  };
  async function submit(event: FormEvent) {
    event.preventDefault(); setContinuing(true);
    const result = await save();
    if (result) {
      try { localStorage.removeItem(storageKey); } catch { /* Optional resume pointer. */ }
      router.push("/initiatives/" + result.initiativeId + "/overview"); router.refresh();
    }
    else setContinuing(false);
  }

  return <form onSubmit={submit} className="rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm sm:p-8">
    <div className="mb-6 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-950">
      Start with what you know. Save incomplete context now and add detail as you prepare your sprint roadmap.
      {props.project && <p className="mt-2">This initiative belongs to <strong>{props.project.name}</strong>. Its shared budget and target date stay attached.</p>}
    </div>
    <fieldset disabled={!loaded || continuing} className="space-y-6 disabled:opacity-60">
      <label className="block text-sm font-semibold text-slate-900">Initiative name <span className="font-normal text-slate-500">(required)</span>
        <input className={fieldClass} value={values.name} onChange={e => change("name", e.target.value)} required minLength={3} maxLength={160} placeholder="For example, customer self-service returns" />
      </label>
      <label className="block text-sm font-semibold text-slate-900">What problem are you solving?
        {props.detailed && <span className="mt-1 block font-normal text-slate-500">Describe what happens today and why it needs to change. You can leave this blank while drafting.</span>}
        <textarea className={fieldClass} rows={3} maxLength={12000} value={values.problemStatement} onChange={e => change("problemStatement", e.target.value)} />
      </label>
      <label className="block text-sm font-semibold text-slate-900">Who is this for?
        <input className={fieldClass} maxLength={4000} value={values.targetCustomer} onChange={e => change("targetCustomer", e.target.value)} placeholder="The users, customers, or team affected" />
      </label>
      <label className="block text-sm font-semibold text-slate-900">What outcome should improve?
        {props.detailed && <span className="mt-1 block font-normal text-slate-500">Describe the change you want to observe, rather than a list of screens to build.</span>}
        <textarea className={fieldClass} rows={3} maxLength={12000} value={values.outcomeStatement} onChange={e => change("outcomeStatement", e.target.value)} />
      </label>
      <label className="block text-sm font-semibold text-slate-900">Planning approach
        <select className={fieldClass} value={values.methodology} onChange={e => change("methodology", e.target.value)}>
          <option value="agile_scrum">Agile / Scrum</option><option value="hybrid">Hybrid</option>
          <option value="kanban">Kanban</option><option value="waterfall">Waterfall</option>
        </select>
      </label>
    </fieldset>
    <div role="status" aria-live="polite" className="mt-5 text-sm text-slate-600">
      {saving ? "Saving your draft…" : dirty ? "Changes waiting to save" : savedAt ? "Draft saved. You can return to it later." : "Enter a name to start saving your draft."}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
      <button type="button" disabled={!loaded || saving || continuing || values.name.trim().length < 3} onClick={() => void save()} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold disabled:opacity-50">Save draft</button>
      <button type="submit" disabled={!loaded || continuing || values.name.trim().length < 3} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{continuing ? "Opening your workspace…" : "Explore the five planning tools →"}</button>
    </div>
    <p className="mt-4 text-xs text-slate-500">Saving intake does not call AI, generate stories, or commit sprint work.</p>
  </form>;
}
